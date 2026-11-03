<?php

namespace App\Services\Support;

use App\Models\SupportAutomationRule;
use App\Models\SupportAutomationRun;
use App\Models\SupportTicket;
use App\Models\UserNotification;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final class TicketAutomationEngine
{
    public const TRIGGERS = [
        'ticket.created',
        'ticket.updated',
        'ticket.assigned',
        'ticket.referred',
        'ticket.replied.staff',
        'ticket.replied.customer',
        'ticket.status_changed',
        'ticket.priority_changed',
        'ticket.closed',
        'ticket.sla_breached',
        'ticket.sla_warning',
    ];

    /**
     * @param  array<string, mixed>  $event
     * @return list<array<string, mixed>>
     */
    public function dispatch(int $tenantId, string $trigger, SupportTicket $ticket, array $event = []): array
    {
        $rules = SupportAutomationRule::query()
            ->where('tenant_id', $tenantId)
            ->where('trigger', $trigger)
            ->where('is_active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        $results = [];
        foreach ($rules as $rule) {
            $results[] = $this->runRule($rule, $ticket, array_merge([
                'trigger' => $trigger,
                'ticket_id' => $ticket->id,
                'tenant_id' => $tenantId,
                'status' => $ticket->status,
                'priority' => $ticket->priority,
                'department_id' => $ticket->department_id,
                'assignee_id' => $ticket->assignee_id,
                'source' => $ticket->source,
                'tags' => $ticket->tags ?? [],
            ], $event));
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    public function runRule(SupportAutomationRule $rule, SupportTicket $ticket, array $event): array
    {
        $run = SupportAutomationRun::query()->create([
            'tenant_id' => $rule->tenant_id,
            'rule_id' => $rule->id,
            'ticket_id' => $ticket->id,
            'status' => 'running',
            'event_payload' => $event,
            'started_at' => now(),
        ]);

        try {
            if (! $this->matchConditions($rule->conditions ?? [], $event, $ticket)) {
                $run->update([
                    'status' => 'skipped',
                    'result_payload' => ['reason' => 'condition_mismatch'],
                    'finished_at' => now(),
                ]);

                return ['rule_id' => $rule->id, 'status' => 'skipped'];
            }

            $executed = [];
            foreach (($rule->actions ?? []) as $action) {
                if (! is_array($action)) {
                    continue;
                }
                $executed[] = $this->executeAction($action, $ticket, $event);
            }

            $rule->run_count = (int) $rule->run_count + 1;
            $rule->last_run_at = now();
            $rule->save();

            $run->update([
                'status' => 'success',
                'result_payload' => ['actions' => $executed],
                'finished_at' => now(),
            ]);

            return ['rule_id' => $rule->id, 'status' => 'success', 'actions' => $executed];
        } catch (\Throwable $e) {
            Log::warning('support.automation.failed', ['rule' => $rule->id, 'error' => $e->getMessage()]);
            $run->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);

            return ['rule_id' => $rule->id, 'status' => 'failed', 'error' => $e->getMessage()];
        }
    }

    /**
     * @param  array<string, mixed>|list<mixed>  $conditions
     * @param  array<string, mixed>  $event
     */
    private function matchConditions(array $conditions, array $event, SupportTicket $ticket): bool
    {
        if ($conditions === []) {
            return true;
        }

        // List of {field, op, value} objects
        if (array_is_list($conditions)) {
            foreach ($conditions as $cond) {
                if (! is_array($cond)) {
                    continue;
                }
                $field = (string) ($cond['field'] ?? '');
                $op = (string) ($cond['op'] ?? 'eq');
                $expected = $cond['value'] ?? null;
                $actual = Arr::get($event, $field);
                if ($field === 'tag' || $field === 'tags') {
                    $tags = $ticket->tags ?? [];
                    $ok = in_array((string) $expected, array_map('strval', $tags), true);
                    if ($op === 'not_contains') {
                        $ok = ! $ok;
                    }
                    if (! $ok) {
                        return false;
                    }
                    continue;
                }
                $ok = match ($op) {
                    'neq', 'ne' => $actual != $expected,
                    'in' => in_array($actual, is_array($expected) ? $expected : [$expected], false),
                    'contains' => is_string($actual) && is_string($expected) && str_contains($actual, $expected),
                    'gt' => is_numeric($actual) && is_numeric($expected) && (float) $actual > (float) $expected,
                    'lt' => is_numeric($actual) && is_numeric($expected) && (float) $actual < (float) $expected,
                    default => $actual == $expected,
                };
                if (! $ok) {
                    return false;
                }
            }

            return true;
        }

        // Flat key => value map
        foreach ($conditions as $key => $expected) {
            if (Arr::get($event, (string) $key) != $expected) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $action
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private function executeAction(array $action, SupportTicket $ticket, array $event): array
    {
        $type = (string) ($action['type'] ?? '');
        $payload = (array) ($action['payload'] ?? $action);

        return match ($type) {
            'set_status' => $this->setStatus($ticket, (string) ($payload['status'] ?? '')),
            'set_priority' => $this->setPriority($ticket, (string) ($payload['priority'] ?? '')),
            'assign' => $this->assign($ticket, isset($payload['assignee_id']) ? (int) $payload['assignee_id'] : null),
            'add_tag' => $this->addTag($ticket, (string) ($payload['tag'] ?? '')),
            'remove_tag' => $this->removeTag($ticket, (string) ($payload['tag'] ?? '')),
            'refer' => $this->refer($ticket, (int) ($payload['department_id'] ?? 0), isset($payload['assignee_id']) ? (int) $payload['assignee_id'] : null),
            'notify' => $this->notify($ticket, $payload),
            'webhook' => $this->webhook($payload, $event, $ticket),
            'add_internal_note' => $this->internalNote($ticket, (string) ($payload['body'] ?? '')),
            default => ['type' => $type, 'status' => 'ignored'],
        };
    }

    /** @return array<string, mixed> */
    private function setStatus(SupportTicket $ticket, string $status): array
    {
        if (! in_array($status, ['open', 'answered', 'pending', 'closed'], true)) {
            return ['type' => 'set_status', 'status' => 'skipped'];
        }
        $ticket->status = $status;
        if ($status === 'closed' && ! $ticket->resolved_at) {
            $ticket->resolved_at = now();
        }
        $ticket->save();

        return ['type' => 'set_status', 'status' => 'ok', 'value' => $status];
    }

    /** @return array<string, mixed> */
    private function setPriority(SupportTicket $ticket, string $priority): array
    {
        if (! in_array($priority, ['low', 'normal', 'high', 'urgent'], true)) {
            return ['type' => 'set_priority', 'status' => 'skipped'];
        }
        $ticket->priority = $priority;
        $ticket->save();

        return ['type' => 'set_priority', 'status' => 'ok', 'value' => $priority];
    }

    /** @return array<string, mixed> */
    private function assign(SupportTicket $ticket, ?int $assigneeId): array
    {
        app(SupportTicketService::class)->assign($ticket, $assigneeId, null, 'automation');

        return ['type' => 'assign', 'status' => 'ok', 'assignee_id' => $assigneeId];
    }

    /** @return array<string, mixed> */
    private function addTag(SupportTicket $ticket, string $tag): array
    {
        $tag = trim(mb_substr($tag, 0, 40));
        if ($tag === '') {
            return ['type' => 'add_tag', 'status' => 'skipped'];
        }
        $tags = array_values(array_unique([...($ticket->tags ?? []), $tag]));
        $ticket->tags = $tags;
        $ticket->save();

        return ['type' => 'add_tag', 'status' => 'ok', 'tag' => $tag];
    }

    /** @return array<string, mixed> */
    private function removeTag(SupportTicket $ticket, string $tag): array
    {
        $tags = array_values(array_filter($ticket->tags ?? [], fn ($t) => (string) $t !== $tag));
        $ticket->tags = $tags;
        $ticket->save();

        return ['type' => 'remove_tag', 'status' => 'ok', 'tag' => $tag];
    }

    /** @return array<string, mixed> */
    private function refer(SupportTicket $ticket, int $departmentId, ?int $assigneeId): array
    {
        if ($departmentId <= 0) {
            return ['type' => 'refer', 'status' => 'skipped'];
        }
        app(SupportTicketService::class)->refer($ticket, $departmentId, $assigneeId, null, 'automation');

        return ['type' => 'refer', 'status' => 'ok', 'department_id' => $departmentId];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function notify(SupportTicket $ticket, array $payload): array
    {
        $userId = (int) ($payload['user_id'] ?? $ticket->assignee_id ?? 0);
        if ($userId <= 0) {
            return ['type' => 'notify', 'status' => 'skipped'];
        }
        UserNotification::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'user_id' => $userId,
            'type' => 'ticket',
            'title' => (string) ($payload['title'] ?? __('api.ticket_automation_notify')),
            'body' => (string) ($payload['body'] ?? $ticket->subject),
            'link' => '/dashboard/tickets/'.$ticket->id,
            'created_at' => now(),
        ]);

        return ['type' => 'notify', 'status' => 'ok', 'user_id' => $userId];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private function webhook(array $payload, array $event, SupportTicket $ticket): array
    {
        $url = (string) ($payload['url'] ?? '');
        if ($url === '' || (! str_starts_with($url, 'https://') && ! str_starts_with($url, 'http://'))) {
            return ['type' => 'webhook', 'status' => 'skipped'];
        }
        $res = Http::timeout(5)->asJson()->post($url, [
            'ticket_id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'event' => $event,
            'body' => $payload['body'] ?? null,
        ]);

        return ['type' => 'webhook', 'status' => $res->successful() ? 'ok' : 'failed', 'code' => $res->status()];
    }

    /** @return array<string, mixed> */
    private function internalNote(SupportTicket $ticket, string $body): array
    {
        $body = trim($body);
        if ($body === '') {
            return ['type' => 'add_internal_note', 'status' => 'skipped'];
        }
        \App\Models\SupportTicketReply::query()->create([
            'tenant_id' => $ticket->tenant_id,
            'ticket_id' => $ticket->id,
            'user_id' => null,
            'is_staff' => true,
            'is_internal' => true,
            'body' => $body,
            'created_at' => now(),
        ]);

        return ['type' => 'add_internal_note', 'status' => 'ok'];
    }
}
