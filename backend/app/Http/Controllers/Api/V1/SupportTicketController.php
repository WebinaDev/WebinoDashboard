<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);

        return response()->json(['data' => $this->mapDetail($row, false)]);
    }

    public function accountCreate(Request $request): JsonResponse
    {
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
        $data = $request->validate(['body' => ['required', 'string', 'max:20000']]);
        $this->insertReply($row, (int) $request->user()->id, $data['body'], true);
        $row->update(['status' => 'answered']);
        UserNotification::query()->create([
            'tenant_id' => $row->tenant_id,
            'user_id' => $row->user_id,
            'type' => 'ticket',
            'title' => __('Support replied to your ticket'),
            'body' => $row->subject,
            'link' => '/dashboard/tickets/'.$row->id,
            'created_at' => now(),
        ]);

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), true)]);
    }

    public function accountReply(Request $request, int $ticket): JsonResponse
    {
        $row = $this->findTicket($request, $ticket, (int) $request->user()->id);
        abort_if(! $row, 404);
        abort_if($row->status === 'closed', 422, __('Ticket is closed.'));
        $data = $request->validate(['body' => ['required', 'string', 'max:20000']]);
        $this->insertReply($row, (int) $request->user()->id, $data['body'], false);
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
        ]);
        if (isset($data['status'])) {
            $row->status = $data['status'];
        }
        if (isset($data['csat_rating'])) {
            $row->csat_rating = (int) $data['csat_rating'];
            $row->csat_at = now();
        }
        $row->save();

        return response()->json(['data' => $this->mapDetail($row->fresh(['user', 'replies.user']), true)]);
    }

    public function accountPatch(Request $request, int $ticket): JsonResponse
    {
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

    private function insertReply(SupportTicket $ticket, int $userId, string $body, bool $isStaff): void
    {
        SupportTicketReply::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'ticket_id' => $ticket->id,
            'user_id' => $userId,
            'is_staff' => $isStaff,
            'body' => $body,
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
            'created_at' => optional($r->created_at)?->toIso8601String(),
        ])->all();

        return $row;
    }
}
