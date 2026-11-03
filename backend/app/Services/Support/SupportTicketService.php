<?php

namespace App\Services\Support;

use App\Models\SupportDepartment;
use App\Models\SupportTicket;
use App\Models\SupportTicketEvent;
use App\Models\SupportTicketReply;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class SupportTicketService
{
    public function nextNumber(int $tenantId): string
    {
        $prefix = (string) (TicketSettings::get($tenantId)['number_prefix'] ?? 'TKT');
        $year = date('Y');
        $seq = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->where('ticket_number', 'like', $prefix.'-'.$year.'-%')
            ->count() + 1;

        return sprintf('%s-%s-%05d', $prefix, $year, $seq);
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @param  array<string, mixed>|null  $formValues
     */
    public function createTicket(
        int $tenantId,
        array $attrs,
        string $body,
        ?int $authorUserId = null,
        bool $authorIsStaff = false,
        ?array $formValues = null,
    ): SupportTicket {
        $settings = TicketSettings::get($tenantId);
        $department = null;
        if (! empty($attrs['department_id'])) {
            $department = SupportDepartment::query()
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $attrs['department_id'])
                ->where('is_active', true)
                ->first();
        }

        $priority = (string) ($attrs['priority'] ?? $department?->default_priority ?? $settings['default_priority'] ?? 'normal');
        if (! in_array($priority, ['low', 'normal', 'high', 'urgent'], true)) {
            $priority = 'normal';
        }

        $assigneeId = $attrs['assignee_id'] ?? null;
        if ($assigneeId === null && $department?->default_assignee_id) {
            $mode = (string) data_get($settings, 'assignment.mode', 'department_default');
            if ($mode === 'department_default' || $mode === 'manual') {
                $assigneeId = (int) $department->default_assignee_id;
            } elseif ($mode === 'round_robin') {
                $assigneeId = $this->roundRobinAssignee($tenantId, (int) $department->id) ?? (int) $department->default_assignee_id;
            }
        }

        $resolveDue = null;
        $firstDue = null;
        if ($department?->sla_resolve_hours) {
            $resolveDue = Carbon::now()->addHours((int) $department->sla_resolve_hours);
        }
        if ($department?->sla_first_response_hours) {
            $firstDue = Carbon::now()->addHours((int) $department->sla_first_response_hours);
        }

        $ticket = SupportTicket::query()->create([
            'tenant_id' => $tenantId,
            'user_id' => $attrs['user_id'] ?? null,
            'guest_name' => $attrs['guest_name'] ?? null,
            'guest_email' => $attrs['guest_email'] ?? null,
            'guest_phone' => $attrs['guest_phone'] ?? null,
            'department_id' => $department?->id,
            'assignee_id' => $assigneeId,
            'subject' => (string) $attrs['subject'],
            'status' => 'open',
            'priority' => $priority,
            'source' => (string) ($attrs['source'] ?? 'portal'),
            'ticket_number' => $this->nextNumber($tenantId),
            'form_values' => $formValues,
            'tags' => $attrs['tags'] ?? null,
            'resolve_due_at' => $resolveDue,
            'first_response_due_at' => $firstDue,
        ]);

        if ($body !== '') {
            SupportTicketReply::query()->create([
                'tenant_id' => $tenantId,
                'ticket_id' => $ticket->id,
                'user_id' => $authorUserId ?? $ticket->user_id,
                'is_staff' => $authorIsStaff,
                'is_internal' => false,
                'body' => $body,
                'created_at' => Carbon::now(),
            ]);
        }

        $this->recordEvent($ticket, $authorUserId, 'created', [
            'source' => $ticket->source,
            'department_id' => $ticket->department_id,
            'assignee_id' => $ticket->assignee_id,
        ]);

        app(TicketSlaService::class)->applyOnCreate($ticket);
        $ticket->refresh();

        if ($assigneeId && data_get($settings, 'assignment.notify_assignee')) {
            UserNotification::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => (int) $assigneeId,
                'type' => 'ticket',
                'title' => __('api.ticket_assigned'),
                'body' => $ticket->subject,
                'link' => '/dashboard/tickets/'.$ticket->id,
                'created_at' => now(),
            ]);
        }

        app(TicketAutomationEngine::class)->dispatch($tenantId, 'ticket.created', $ticket);

        return $ticket->fresh(['user', 'department', 'assignee', 'replies.user']);
    }

    public function assign(SupportTicket $ticket, ?int $assigneeId, ?int $actorId, ?string $note = null): SupportTicket
    {
        $from = $ticket->assignee_id;
        $ticket->assignee_id = $assigneeId;
        $ticket->save();
        $this->recordEvent($ticket, $actorId, 'assigned', [
            'from' => $from,
            'to' => $assigneeId,
            'note' => $note,
        ]);
        if ($assigneeId) {
            UserNotification::query()->create([
                'tenant_id' => $ticket->tenant_id,
                'user_id' => $assigneeId,
                'type' => 'ticket',
                'title' => __('api.ticket_assigned'),
                'body' => $ticket->subject,
                'link' => '/dashboard/tickets/'.$ticket->id,
                'created_at' => now(),
            ]);
        }

        app(TicketAutomationEngine::class)->dispatch((int) $ticket->tenant_id, 'ticket.assigned', $ticket, [
            'from' => $from,
            'to' => $assigneeId,
        ]);

        return $ticket;
    }

    public function refer(SupportTicket $ticket, int $departmentId, ?int $assigneeId, ?int $actorId, ?string $note = null): SupportTicket
    {
        $fromDept = $ticket->department_id;
        $ticket->referred_from_department_id = $fromDept;
        $ticket->department_id = $departmentId;
        if ($assigneeId !== null) {
            $ticket->assignee_id = $assigneeId;
        } else {
            $dept = SupportDepartment::query()->find($departmentId);
            if ($dept?->default_assignee_id) {
                $ticket->assignee_id = (int) $dept->default_assignee_id;
            }
        }
        if ($ticket->status === 'closed') {
            $ticket->status = 'open';
        }
        $ticket->save();
        $this->recordEvent($ticket, $actorId, 'referred', [
            'from_department_id' => $fromDept,
            'to_department_id' => $departmentId,
            'assignee_id' => $ticket->assignee_id,
            'note' => $note,
        ]);

        app(TicketAutomationEngine::class)->dispatch((int) $ticket->tenant_id, 'ticket.referred', $ticket, [
            'from_department_id' => $fromDept,
            'to_department_id' => $departmentId,
        ]);

        return $ticket;
    }

    public function onStatusChanged(SupportTicket $ticket, string $from, ?int $actorId = null): void
    {
        $this->recordEvent($ticket, $actorId, 'status_changed', [
            'from' => $from,
            'to' => $ticket->status,
        ]);
        if ($ticket->status === 'closed') {
            app(TicketSlaService::class)->markResolved($ticket);
            app(CsatCampaignService::class)->queueOnResolve($ticket);
            app(TicketAutomationEngine::class)->dispatch((int) $ticket->tenant_id, 'ticket.closed', $ticket, [
                'from' => $from,
            ]);
        }
        app(TicketAutomationEngine::class)->dispatch((int) $ticket->tenant_id, 'ticket.status_changed', $ticket, [
            'from' => $from,
            'to' => $ticket->status,
        ]);
        app(TicketAutomationEngine::class)->dispatch((int) $ticket->tenant_id, 'ticket.updated', $ticket);
    }

    /** @param  array<string, mixed>  $payload */
    public function recordEvent(SupportTicket $ticket, ?int $actorId, string $type, array $payload = []): void
    {
        SupportTicketEvent::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'ticket_id' => $ticket->id,
            'actor_id' => $actorId,
            'type' => $type,
            'payload' => $payload,
            'created_at' => Carbon::now(),
        ]);
    }

    public function markFirstStaffResponse(SupportTicket $ticket): void
    {
        app(TicketSlaService::class)->markFirstResponse($ticket);
    }

    private function roundRobinAssignee(int $tenantId, int $departmentId): ?int
    {
        $candidates = User::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('role', ['admin', 'staff'])
            ->orderBy('id')
            ->pluck('id')
            ->all();
        if ($candidates === []) {
            return null;
        }
        $openCounts = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->where('department_id', $departmentId)
            ->whereNotIn('status', ['closed'])
            ->whereIn('assignee_id', $candidates)
            ->selectRaw('assignee_id, count(*) as c')
            ->groupBy('assignee_id')
            ->pluck('c', 'assignee_id');
        $best = null;
        $bestCount = PHP_INT_MAX;
        foreach ($candidates as $uid) {
            $c = (int) ($openCounts[$uid] ?? 0);
            if ($c < $bestCount) {
                $bestCount = $c;
                $best = (int) $uid;
            }
        }

        return $best;
    }

    public function slugify(string $name): string
    {
        $slug = Str::slug($name);
        if ($slug === '') {
            $slug = 'dept-'.substr(md5($name.microtime(true)), 0, 8);
        }

        return mb_substr($slug, 0, 80);
    }
}
