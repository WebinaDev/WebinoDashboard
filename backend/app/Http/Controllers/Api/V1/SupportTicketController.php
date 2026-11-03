<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportDepartment;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\UserNotification;
use App\Services\Support\SupportTicketService;
use App\Services\Support\TicketSettings;
use App\Services\Webino\WebinoTicketsClient;
use App\Support\PortalAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SupportTicketController extends Controller
{
    public const STATUSES = ['open', 'answered', 'pending', 'closed'];

    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public function __construct(private readonly SupportTicketService $tickets) {}

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
        $row = $this->findTicket($request, $ticket, withEvents: true);
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
        $tid = (int) $request->user()->tenant_id;
        $settings = TicketSettings::get($tid);
        $openCount = SupportTicket::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $request->user()->id)
            ->whereNotIn('status', ['closed'])
            ->count();
        $max = (int) ($settings['max_open_per_user'] ?? 10);
        abort_if($max > 0 && $openCount >= $max, 422, __('api.ticket_open_limit'));

        $data = $request->validate([
            'subject' => ['required', 'string', 'max:190'],
            'body' => ['required', 'string', 'max:20000'],
            'department_id' => ['nullable', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tid)->where('is_active', true))],
            'priority' => ['nullable', Rule::in(self::PRIORITIES)],
            'form_values' => ['nullable', 'array'],
        ]);

        $ticket = $this->tickets->createTicket(
            $tid,
            [
                'user_id' => $request->user()->id,
                'department_id' => $data['department_id'] ?? null,
                'priority' => $data['priority'] ?? null,
                'subject' => $data['subject'],
                'source' => 'portal',
            ],
            $data['body'],
            (int) $request->user()->id,
            false,
            is_array($data['form_values'] ?? null) ? $data['form_values'] : null,
        );

        return response()->json(['data' => $this->mapDetail($ticket, false)], 201);
    }

    public function staffCreate(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:190'],
            'body' => ['required', 'string', 'max:20000'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'guest_name' => ['nullable', 'string', 'max:120'],
            'guest_email' => ['nullable', 'email', 'max:190'],
            'department_id' => ['nullable', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tid))],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'priority' => ['nullable', Rule::in(self::PRIORITIES)],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'form_values' => ['nullable', 'array'],
        ]);
        abort_if(empty($data['user_id']) && empty($data['guest_name']), 422, __('validation.required', ['attribute' => 'user_id']));

        $ticket = $this->tickets->createTicket(
            $tid,
            [
                'user_id' => $data['user_id'] ?? null,
                'guest_name' => $data['guest_name'] ?? null,
                'guest_email' => $data['guest_email'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'assignee_id' => $data['assignee_id'] ?? null,
                'priority' => $data['priority'] ?? null,
                'subject' => $data['subject'],
                'source' => 'staff',
                'tags' => $data['tags'] ?? null,
            ],
            $data['body'],
            (int) $request->user()->id,
            true,
            is_array($data['form_values'] ?? null) ? $data['form_values'] : null,
        );

        return response()->json(['data' => $this->mapDetail($ticket, true)], 201);
    }

    public function staffReply(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket);
        abort_if(! $row, 404);
        [$body, $attachments, $isInternal] = $this->validatedReplyPayload($request, allowInternal: true);
        $this->insertReply($row, (int) $request->user()->id, $body, true, $attachments, $isInternal);
        if (! $isInternal) {
            $this->tickets->markFirstStaffResponse($row);
            $row->update(['status' => 'answered']);
            app(\App\Services\Support\TicketAutomationEngine::class)->dispatch(
                (int) $row->tenant_id,
                'ticket.replied.staff',
                $row,
            );
            \App\Services\Bots\Engine\BotNotifier::ticketReply($row, $body);
            if ($row->user_id) {
                UserNotification::query()->create([
                    'tenant_id' => $row->tenant_id,
                    'user_id' => $row->user_id,
                    'type' => 'ticket',
                    'title' => __('api.ticket_staff_replied'),
                    'body' => $row->subject,
                    'link' => '/dashboard/account/tickets/'.$row->id,
                    'created_at' => now(),
                ]);
            }
        } else {
            $row->touch();
        }

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'department', 'assignee', 'replies.user', 'events.actor']), true)]);
    }

    public function accountReply(Request $request, int $ticket): JsonResponse
    {
        PortalAccess::authorize($request);
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);
        abort_if($row->status === 'closed', 422, __('api.ticket_closed'));
        [$body, $attachments] = $this->validatedReplyPayload($request);
        $this->insertReply($row, (int) $request->user()->id, $body, false, $attachments, false);
        if ($row->status === 'answered') {
            $row->update(['status' => 'open']);
        } else {
            $row->touch();
        }
        app(\App\Services\Support\TicketAutomationEngine::class)->dispatch(
            (int) $row->tenant_id,
            'ticket.replied.customer',
            $row,
        );

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'department', 'replies.user']), false)]);
    }

    public function staffPatch(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket, withEvents: true);
        abort_if(! $row, 404);
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(self::STATUSES)],
            'priority' => ['sometimes', Rule::in(self::PRIORITIES)],
            'csat_rating' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'assignee_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'department_id' => ['sometimes', 'nullable', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tid))],
            'tags' => ['sometimes', 'nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'refer_department_id' => ['sometimes', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tid))],
            'refer_assignee_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'refer_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'assign_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        if (isset($data['refer_department_id'])) {
            $this->tickets->refer(
                $row,
                (int) $data['refer_department_id'],
                array_key_exists('refer_assignee_id', $data) ? $data['refer_assignee_id'] : null,
                (int) $request->user()->id,
                $data['refer_note'] ?? null,
            );
            $row->refresh();
        }

        if (array_key_exists('assignee_id', $data) && ! isset($data['refer_department_id'])) {
            $this->tickets->assign($row, $data['assignee_id'], (int) $request->user()->id, $data['assign_note'] ?? null);
            $row->refresh();
        }

        $dirty = false;
        $prevStatus = $row->status;
        $prevPriority = $row->priority;
        foreach (['status', 'priority', 'department_id', 'tags'] as $field) {
            if (array_key_exists($field, $data) && $field !== 'assignee_id') {
                if ($field === 'department_id' && isset($data['refer_department_id'])) {
                    continue;
                }
                $row->{$field} = $data[$field];
                $dirty = true;
            }
        }
        if (isset($data['csat_rating'])) {
            $row->csat_rating = (int) $data['csat_rating'];
            $row->csat_at = now();
            $dirty = true;
        }
        if ($dirty) {
            $row->save();
            $this->tickets->recordEvent($row, (int) $request->user()->id, 'updated', [
                'status' => $row->status,
                'priority' => $row->priority,
                'department_id' => $row->department_id,
            ]);
            if (isset($data['status']) && $data['status'] !== $prevStatus) {
                $this->tickets->onStatusChanged($row, (string) $prevStatus, (int) $request->user()->id);
            }
            if (isset($data['priority']) && $data['priority'] !== $prevPriority) {
                app(\App\Services\Support\TicketAutomationEngine::class)->dispatch(
                    (int) $row->tenant_id,
                    'ticket.priority_changed',
                    $row,
                    ['from' => $prevPriority, 'to' => $row->priority],
                );
            }
        }

        if (array_key_exists('assignee_id', $data) && $row->erp_ticket_id) {
            app(WebinoTicketsClient::class)->assign((int) $row->erp_ticket_id, $row->assignee_id ? (int) $row->assignee_id : null);
        }
        if (isset($data['csat_rating']) && $row->erp_ticket_id) {
            app(WebinoTicketsClient::class)->rating((int) $row->erp_ticket_id, (int) $data['csat_rating']);
        }

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'department', 'assignee', 'replies.user', 'events.actor']), true)]);
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
            $taskId = $row->converted_task_id ?: null;
        }
        $row->converted_task_id = $taskId ? (int) $taskId : $row->converted_task_id;
        $row->save();

        return response()->json([
            'data' => [
                'ticket' => $this->mapDetail($row->fresh(['user', 'department', 'assignee', 'replies.user']), true),
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
                'priority' => $row->priority ?: 'normal',
            ]);
        } else {
            $first = $row->replies()->orderBy('id')->first();
            $res = $erp->create([
                'subject' => $row->subject,
                'body' => $first?->body,
                'priority' => $row->priority ?: 'normal',
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
            'data' => $this->mapDetail($row->fresh(['user', 'department', 'assignee', 'replies.user']), true),
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

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'department', 'replies.user']), false)]);
    }

    public function accountMeta(Request $request): JsonResponse
    {
        PortalAccess::authorize($request);
        $tid = (int) $request->user()->tenant_id;
        $deps = SupportDepartment::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        return response()->json([
            'data' => [
                'departments' => $deps->map(fn ($d) => [
                    'id' => $d->id,
                    'name_fa' => $d->name_fa,
                    'name_en' => $d->name_en,
                    'form_fields' => $d->form_fields ?? [],
                    'default_priority' => $d->default_priority,
                ])->all(),
                'priorities' => self::PRIORITIES,
            ],
        ]);
    }

    public function staffAgents(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = \App\Models\User::query()
            ->where('tenant_id', $tid)
            ->whereIn('role', ['admin', 'staff'])
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role']);

        return response()->json([
            'data' => [
                'items' => $rows->map(fn ($u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'role' => $u->role,
                ])->all(),
            ],
        ]);
    }

    private function listTickets(Request $request, bool $staff, ?int $userId = null): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(50, max(1, (int) $request->query('per_page', 20)));
        $q = SupportTicket::query()->where('tenant_id', $tid)->with(['user', 'department', 'assignee']);
        if ($userId) {
            $q->where('user_id', $userId);
        }
        $status = (string) $request->query('status', '');
        if ($status !== '' && $status !== 'all' && in_array($status, self::STATUSES, true)) {
            $q->where('status', $status);
        }
        $priority = (string) $request->query('priority', '');
        if ($priority !== '' && in_array($priority, self::PRIORITIES, true)) {
            $q->where('priority', $priority);
        }
        if ($dept = (int) $request->query('department_id', 0)) {
            $q->where('department_id', $dept);
        }
        if ($assignee = (int) $request->query('assignee_id', 0)) {
            $q->where('assignee_id', $assignee);
        }
        if ($staff && $request->boolean('mine')) {
            $q->where('assignee_id', (int) $request->user()->id);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $q->where(function ($qq) use ($search) {
                $qq->where('subject', 'like', '%'.$search.'%')
                    ->orWhere('ticket_number', 'like', '%'.$search.'%')
                    ->orWhere('guest_name', 'like', '%'.$search.'%')
                    ->orWhere('guest_email', 'like', '%'.$search.'%');
            });
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

    private function findTicket(Request $request, int $id, ?int $userId = null, bool $withEvents = false): ?SupportTicket
    {
        $with = ['user', 'department', 'assignee', 'replies.user'];
        if ($withEvents) {
            $with[] = 'events.actor';
        }
        $q = SupportTicket::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('id', $id)
            ->with($with);
        if ($userId) {
            $q->where('user_id', $userId);
        }

        return $q->first();
    }

    /**
     * @return array{0: string, 1: list<array<string, mixed>>, 2?: bool}
     */
    private function validatedReplyPayload(Request $request, bool $allowInternal = false): array
    {
        $rules = [
            'body' => ['nullable', 'string', 'max:20000'],
            'attachments' => ['sometimes', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:8192', 'mimetypes:image/jpeg,image/png,image/webp,application/pdf,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav'],
            'voice' => ['nullable', 'file', 'max:5120', 'mimetypes:audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav'],
        ];
        if ($allowInternal) {
            $rules['is_internal'] = ['sometimes', 'boolean'];
        }
        $data = $request->validate($rules);
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

        $isInternal = $allowInternal && (bool) ($data['is_internal'] ?? false);

        return [$body !== '' ? $body : ' ', $attachments, $isInternal];
    }

    /**
     * @param  list<array<string, mixed>>  $attachments
     */
    private function insertReply(SupportTicket $ticket, int $userId, string $body, bool $isStaff, array $attachments = [], bool $isInternal = false): void
    {
        SupportTicketReply::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'ticket_id' => $ticket->id,
            'user_id' => $userId,
            'is_staff' => $isStaff,
            'is_internal' => $isInternal,
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
            'ticket_number' => $t->ticket_number,
            'user_id' => $t->user_id,
            'assignee_id' => $t->assignee_id ?? null,
            'assignee_name' => $t->assignee?->name,
            'department_id' => $t->department_id,
            'department_name' => $t->department?->name_fa ?? $t->department?->name_en,
            'erp_ticket_id' => $t->erp_ticket_id ?? null,
            'converted_task_id' => $t->converted_task_id ?? null,
            'subject' => $t->subject,
            'status' => $t->status,
            'priority' => $t->priority ?? 'normal',
            'source' => $t->source ?? 'portal',
            'tags' => $t->tags ?? [],
            'created_at' => optional($t->created_at)?->toIso8601String(),
            'updated_at' => optional($t->updated_at)?->toIso8601String(),
            'csat_rating' => $t->csat_rating,
            'csat_at' => optional($t->csat_at)?->toIso8601String(),
            'resolve_due_at' => optional($t->resolve_due_at)?->toIso8601String(),
            'first_response_at' => optional($t->first_response_at)?->toIso8601String(),
            'first_response_due_at' => optional($t->first_response_due_at)?->toIso8601String(),
            'sla_breached_at' => optional($t->sla_breached_at)?->toIso8601String(),
            'sla_breach_type' => $t->sla_breach_type,
            'sla_policy_id' => $t->sla_policy_id,
            'resolved_at' => optional($t->resolved_at)?->toIso8601String(),
            'csat_comment' => $t->csat_comment,
        ];
        if ($staff) {
            $row['user_name'] = $t->user?->name ?? $t->guest_name;
            $row['user_email'] = $t->user?->email ?? $t->guest_email;
            $row['guest_phone'] = $t->guest_phone;
        }

        return $row;
    }

    /** @return array<string, mixed> */
    private function mapDetail(SupportTicket $t, bool $staff): array
    {
        $row = $this->mapList($t, $staff);
        $row['form_values'] = $t->form_values ?? [];
        $row['replies'] = $t->replies
            ->filter(fn (SupportTicketReply $r) => $staff || ! $r->is_internal)
            ->map(fn (SupportTicketReply $r) => [
                'id' => $r->id,
                'ticket_id' => $r->ticket_id,
                'user_id' => $r->user_id,
                'author' => $r->user?->name ?? ($t->guest_name ?: ''),
                'is_staff' => (bool) $r->is_staff,
                'is_internal' => (bool) $r->is_internal,
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
            ])->values()->all();

        if ($staff && $t->relationLoaded('events')) {
            $row['events'] = $t->events->map(fn ($e) => [
                'id' => $e->id,
                'type' => $e->type,
                'actor' => $e->actor?->name,
                'payload' => $e->payload ?? [],
                'created_at' => optional($e->created_at)?->toIso8601String(),
            ])->all();
        }

        return $row;
    }
}
