<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\UserNotification;
use App\Support\PortalAccess;
use App\Services\Webino\WebinoTicketsClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SupportTicketController extends Controller
{
    public const STATUSES = ['open', 'answered', 'pending', 'closed'];

    public function staffIndex(Request $request): JsonResponse
    {
        return $this->listTickets($request, staff: true);
    }

    public function accountIndex(Request $request): JsonResponse
    {
        PortalAccess::authorize($request);

        return $this->listTickets($request, staff: false, userId: (int) $request->user()->id);
    }

    public function staffShow(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);

        return response()->json(['data' => $this->mapDetail($row, true)]);
    }

    public function accountShow(Request $request, int $ticket): JsonResponse
    {
        PortalAccess::authorize($request);
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);

        return response()->json(['data' => $this->mapDetail($row, false)]);
    }

    public function accountCreate(Request $request): JsonResponse
    {
        PortalAccess::authorize($request);
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:190'],
            'body' => ['required', 'string', 'max:20000'],
        ]);
        $user = $request->user();
        $ticket = SupportTicket::query()->create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'subject' => $data['subject'],
            'status' => 'open',
        ]);
        $this->insertReply($ticket, $user->id, $data['body'], false);

        return response()->json(['data' => $this->mapDetail($ticket->fresh(['user', 'replies.user']), false)], 201);
    }

    public function staffReply(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);
        [$body, $attachments] = $this->validatedReplyPayload($request);
        $this->insertReply($row, (int) $request->user()->id, $body, true, $attachments);
        $row->update(['status' => 'answered']);
        UserNotification::query()->create([
            'tenant_id' => $row->tenant_id,
            'user_id' => $row->user_id,
            'type' => 'ticket',
            'title' => __('api.ticket_staff_replied'),
            'body' => $row->subject,
            'link' => '/dashboard/account/tickets/'.$row->id,
            'created_at' => now(),
        ]);

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), true)]);
    }

    public function accountReply(Request $request, int $ticket): JsonResponse
    {
        PortalAccess::authorize($request);
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);
        abort_if($row->status === 'closed', 422, __('api.ticket_closed'));
        [$body, $attachments] = $this->validatedReplyPayload($request);
        $this->insertReply($row, (int) $request->user()->id, $body, false, $attachments);
        if ($row->status === 'answered') {
            $row->update(['status' => 'open']);
        } else {
            $row->touch();
        }

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), false)]);
    }

    public function staffPatch(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(self::STATUSES)],
            'csat_rating' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'assignee_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);
        if (isset($data['status'])) {
            $row->status = $data['status'];
        }
        if (array_key_exists('assignee_id', $data)) {
            $row->assignee_id = $data['assignee_id'];
        }
        if (isset($data['csat_rating'])) {
            $row->csat_rating = (int) $data['csat_rating'];
            $row->csat_at = now();
        }
        $row->save();

        if (array_key_exists('assignee_id', $data) && $row->erp_ticket_id) {
            app(WebinoTicketsClient::class)->assign((int) $row->erp_ticket_id, $row->assignee_id ? (int) $row->assignee_id : null);
        }
        if (isset($data['csat_rating']) && $row->erp_ticket_id) {
            app(WebinoTicketsClient::class)->rating((int) $row->erp_ticket_id, (int) $data['csat_rating']);
        }

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), true)]);
    }

    public function staffConvertTask(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);

        $erp = app(WebinoTicketsClient::class);
        $taskId = null;
        if ($row->erp_ticket_id && $erp->isConfigured()) {
            $res = $erp->convertTask((int) $row->erp_ticket_id);
            if ($res['ok']) {
                $taskId = data_get($res['data'], 'data.task_id') ?? data_get($res['data'], 'task_id');
            }
        }
        if (! $taskId) {
            // Local placeholder task id when ERP unreachable — keep honesty in payload.
            $taskId = $row->converted_task_id ?: null;
        }
        $row->converted_task_id = $taskId ? (int) $taskId : $row->converted_task_id;
        $row->save();

        return response()->json([
            'data' => [
                'ticket' => $this->mapDetail($row->fresh(['user', 'replies.user']), true),
                'task_id' => $row->converted_task_id,
                'erp_synced' => (bool) ($row->erp_ticket_id && $taskId),
                'erp_unavailable' => $row->erp_ticket_id ? false : ! $erp->isConfigured(),
            ],
        ]);
    }

    public function staffSyncErp(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);
        $erp = app(WebinoTicketsClient::class);
        if (! $erp->isConfigured()) {
            return response()->json([
                'ok' => false,
                'unavailable' => true,
                'message' => 'WEBINO_ERP_API_TOKEN not configured',
                'data' => $this->mapDetail($row, true),
            ], 200);
        }

        if ($row->erp_ticket_id) {
            $res = $erp->update((int) $row->erp_ticket_id, [
                'status' => $row->status,
                'assignee_id' => $row->assignee_id,
                'priority' => 'normal',
            ]);
        } else {
            $first = $row->replies()->orderBy('id')->first();
            $res = $erp->create([
                'subject' => $row->subject,
                'body' => $first?->body,
                'priority' => 'normal',
            ]);
            $erpId = data_get($res['data'], 'data.id') ?? data_get($res['data'], 'id');
            if ($res['ok'] && $erpId) {
                $row->erp_ticket_id = (int) $erpId;
                $row->save();
            }
        }

        return response()->json([
            'ok' => (bool) ($res['ok'] ?? false),
            'message' => $res['message'] ?? null,
            'data' => $this->mapDetail($row->fresh(['user', 'replies.user']), true),
        ]);
    }


    public function accountPatch(Request $request, int $ticket): JsonResponse
    {
        PortalAccess::authorize($request);
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);
        abort_if(! in_array($row->status, ['answered', 'closed'], true), 422);
        $data = $request->validate(['csat_rating' => ['required', 'integer', 'min:1', 'max:5']]);
        $row->update([
            'csat_rating' => (int) $data['csat_rating'],
            'csat_at' => now(),
        ]);

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), false)]);
    }

    private function listTickets(Request $request, bool $staff, ?int $userId = null): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(50, max(1, (int) $request->query('per_page', 20)));
        $q = SupportTicket::query()->where('tenant_id', $tid)->with('user');
        if ($userId) {
            $q->where('user_id', $userId);
        }
        $status = (string) $request->query('status', '');
        if ($status !== '' && $status !== 'all' && in_array($status, self::STATUSES, true)) {
            $q->where('status', $status);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $q->where('subject', 'like', '%'.$search.'%');
        }
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('updated_at')->orderByDesc('id')
            ->forPage($page, $perPage)
            ->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportTicket $t) => $this->mapList($t, $staff))->all(),
                'total' => $total,
                'page' => $page,
            ],
        ]);
    }

    private function findTicket(Request $request, int $id, ?int $userId = null): ?SupportTicket
    {
        $q = SupportTicket::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('id', $id)
            ->with(['user', 'replies.user']);
        if ($userId) {
            $q->where('user_id', $userId);
        }

        return $q->first();
    }

    /**
     * @return array{0: string, 1: list<array<string, mixed>>}
     */
    private function validatedReplyPayload(Request $request): array
    {
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:20000'],
            'attachments' => ['sometimes', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:8192', 'mimetypes:image/jpeg,image/png,image/webp,application/pdf,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav'],
            'voice' => ['nullable', 'file', 'max:5120', 'mimetypes:audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav'],
        ]);
        $body = trim((string) ($data['body'] ?? ''));
        $hasFiles = $request->hasFile('attachments') || $request->hasFile('voice');
        abort_if($body === '' && ! $hasFiles, 422, __('validation.required', ['attribute' => 'body']));

        $tid = (int) $request->user()->tenant_id;
        $attachments = [];
        /** @var array<int, UploadedFile>|UploadedFile|null $files */
        $files = $request->file('attachments');
        if ($files instanceof UploadedFile) {
            $files = [$files];
        }
        foreach ($files ?? [] as $file) {
            if (! $file instanceof UploadedFile) {
                continue;
            }
            $path = $file->store("tickets/{$tid}", 'public');
            $attachments[] = [
                'path' => $path,
                'name' => $file->getClientOriginalName(),
                'mime' => (string) $file->getMimeType(),
                'kind' => str_starts_with((string) $file->getMimeType(), 'audio/') ? 'voice' : 'file',
                'size' => $file->getSize(),
            ];
        }
        if ($request->hasFile('voice')) {
            /** @var UploadedFile $voice */
            $voice = $request->file('voice');
            $path = $voice->store("tickets/{$tid}", 'public');
            $attachments[] = [
                'path' => $path,
                'name' => $voice->getClientOriginalName() ?: 'voice.webm',
                'mime' => (string) $voice->getMimeType(),
                'kind' => 'voice',
                'size' => $voice->getSize(),
            ];
        }

        return [$body !== '' ? $body : ' ', $attachments];
    }

    /**
     * @param  list<array<string, mixed>>  $attachments
     */
    private function insertReply(SupportTicket $ticket, int $userId, string $body, bool $isStaff, array $attachments = []): void
    {
        SupportTicketReply::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'ticket_id' => $ticket->id,
            'user_id' => $userId,
            'is_staff' => $isStaff,
            'body' => $body,
            'attachments' => $attachments === [] ? null : $attachments,
            'created_at' => Carbon::now(),
        ]);
        $ticket->touch();
    }

    /** @return array<string, mixed> */
    private function mapList(SupportTicket $t, bool $staff): array
    {
        $row = [
            'id' => $t->id,
            'user_id' => $t->user_id,
            'assignee_id' => $t->assignee_id ?? null,
            'erp_ticket_id' => $t->erp_ticket_id ?? null,
            'converted_task_id' => $t->converted_task_id ?? null,
            'subject' => $t->subject,
            'status' => $t->status,
            'created_at' => optional($t->created_at)?->toIso8601String(),
            'updated_at' => optional($t->updated_at)?->toIso8601String(),
            'csat_rating' => $t->csat_rating,
            'csat_at' => optional($t->csat_at)?->toIso8601String(),
        ];
        if ($staff) {
            $row['user_name'] = $t->user?->name;
            $row['user_email'] = $t->user?->email;
        }

        return $row;
    }

    /** @return array<string, mixed> */
    private function mapDetail(SupportTicket $t, bool $staff): array
    {
        $row = $this->mapList($t, $staff);
        $row['replies'] = $t->replies->map(fn (SupportTicketReply $r) => [
            'id' => $r->id,
            'ticket_id' => $r->ticket_id,
            'user_id' => $r->user_id,
            'author' => $r->user?->name ?? '',
            'is_staff' => (bool) $r->is_staff,
            'body' => $r->body,
            'attachments' => collect($r->attachments ?? [])->map(function (array $item) {
                $path = (string) ($item['path'] ?? '');

                return [
                    'name' => (string) ($item['name'] ?? 'file'),
                    'mime' => (string) ($item['mime'] ?? ''),
                    'kind' => (string) ($item['kind'] ?? 'file'),
                    'size' => (int) ($item['size'] ?? 0),
                    'url' => $path !== '' ? Storage::disk('public')->url($path) : null,
                ];
            })->values()->all(),
            'created_at' => optional($r->created_at)?->toIso8601String(),
        ])->all();

        return $row;
    }
}
