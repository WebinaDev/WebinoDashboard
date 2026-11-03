<?php

namespace App\Services\Support;

use App\Models\SupportSlaPolicy;
use App\Models\SupportTicket;
use App\Models\UserNotification;
use Illuminate\Support\Carbon;

final class TicketSlaService
{
    public function resolvePolicy(SupportTicket $ticket): ?SupportSlaPolicy
    {
        $q = SupportSlaPolicy::query()
            ->where('tenant_id', $ticket->tenant_id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id');

        $policies = $q->get();
        if ($policies->isEmpty()) {
            return null;
        }

        $best = null;
        $bestScore = -1;
        foreach ($policies as $p) {
            $score = 0;
            if ($p->department_id && (int) $p->department_id === (int) $ticket->department_id) {
                $score += 2;
            } elseif ($p->department_id) {
                continue;
            }
            if ($p->priority && (string) $p->priority === (string) $ticket->priority) {
                $score += 1;
            } elseif ($p->priority) {
                continue;
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $p;
            }
        }

        return $best;
    }

    public function applyOnCreate(SupportTicket $ticket): SupportTicket
    {
        $policy = $this->resolvePolicy($ticket);
        if (! $policy) {
            // Fall back to department hour fields already applied by SupportTicketService.
            return $ticket;
        }

        $base = Carbon::now();
        $firstDue = $this->addMinutes($base, (int) $policy->first_response_minutes, $policy, $ticket->tenant_id);
        $resolveDue = $this->addMinutes($base, (int) $policy->resolve_minutes, $policy, $ticket->tenant_id);

        $ticket->sla_policy_id = $policy->id;
        $ticket->first_response_due_at = $firstDue;
        $ticket->resolve_due_at = $resolveDue;
        $ticket->sla_breached_at = null;
        $ticket->sla_breach_type = null;
        $ticket->sla_alerted_at = null;
        $ticket->save();

        return $ticket;
    }

    public function markFirstResponse(SupportTicket $ticket): void
    {
        if ($ticket->first_response_at) {
            return;
        }
        $ticket->first_response_at = Carbon::now();
        if ($ticket->first_response_due_at && Carbon::now()->greaterThan($ticket->first_response_due_at) && ! $ticket->sla_breached_at) {
            $ticket->sla_breached_at = Carbon::now();
            $ticket->sla_breach_type = 'first_response';
        }
        $ticket->save();
    }

    public function markResolved(SupportTicket $ticket): void
    {
        if (! $ticket->resolved_at) {
            $ticket->resolved_at = Carbon::now();
        }
        if ($ticket->resolve_due_at && Carbon::now()->greaterThan($ticket->resolve_due_at) && ! $ticket->sla_breached_at) {
            $ticket->sla_breached_at = Carbon::now();
            $ticket->sla_breach_type = 'resolve';
        }
        $ticket->save();
    }

    /** @return array{breached:int, warned:int} */
    public function refreshTenant(int $tenantId): array
    {
        $breached = 0;
        $warned = 0;
        $now = Carbon::now();

        SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereNotIn('status', ['closed'])
            ->where(function ($q) {
                $q->whereNotNull('first_response_due_at')->orWhereNotNull('resolve_due_at');
            })
            ->orderBy('id')
            ->each(function (SupportTicket $ticket) use ($now, &$breached, &$warned) {
                $policy = $ticket->sla_policy_id
                    ? SupportSlaPolicy::query()->find($ticket->sla_policy_id)
                    : null;

                // Warning before breach
                if (! $ticket->sla_alerted_at && $policy) {
                    $alertMins = max(0, (int) $policy->alert_before_minutes);
                    $warnAt = null;
                    if (! $ticket->first_response_at && $ticket->first_response_due_at) {
                        $warnAt = Carbon::parse($ticket->first_response_due_at)->subMinutes($alertMins);
                    } elseif ($ticket->resolve_due_at) {
                        $warnAt = Carbon::parse($ticket->resolve_due_at)->subMinutes($alertMins);
                    }
                    if ($warnAt && $now->greaterThanOrEqualTo($warnAt) && $now->lessThan(
                        $ticket->first_response_at ? $ticket->resolve_due_at : $ticket->first_response_due_at
                    )) {
                        $ticket->sla_alerted_at = $now;
                        $ticket->save();
                        $this->notifyBreach($ticket, $policy, warning: true);
                        app(TicketAutomationEngine::class)->dispatch($ticket->tenant_id, 'ticket.sla_warning', $ticket);
                        $warned++;
                    }
                }

                if ($ticket->sla_breached_at) {
                    return;
                }

                $type = null;
                if (! $ticket->first_response_at && $ticket->first_response_due_at && $now->greaterThan($ticket->first_response_due_at)) {
                    $type = 'first_response';
                } elseif ($ticket->resolve_due_at && $now->greaterThan($ticket->resolve_due_at)) {
                    $type = 'resolve';
                }
                if (! $type) {
                    return;
                }

                $ticket->sla_breached_at = $now;
                $ticket->sla_breach_type = $type;
                $ticket->save();
                $this->notifyBreach($ticket, $policy, warning: false);
                app(TicketAutomationEngine::class)->dispatch($ticket->tenant_id, 'ticket.sla_breached', $ticket, [
                    'breach_type' => $type,
                ]);
                $breached++;
            });

        return ['breached' => $breached, 'warned' => $warned];
    }

    /** @return array<string, mixed> */
    public function dashboard(int $tenantId): array
    {
        $open = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereNotIn('status', ['closed']);

        $breached = (clone $open)->whereNotNull('sla_breached_at')->count();
        $dueSoon = (clone $open)
            ->whereNull('sla_breached_at')
            ->where(function ($q) {
                $q->where(function ($qq) {
                    $qq->whereNull('first_response_at')
                        ->whereNotNull('first_response_due_at')
                        ->whereBetween('first_response_due_at', [now(), now()->addHours(8)]);
                })->orWhere(function ($qq) {
                    $qq->whereNotNull('resolve_due_at')
                        ->whereBetween('resolve_due_at', [now(), now()->addHours(8)]);
                });
            })
            ->count();

        $rows = (clone $open)
            ->with(['assignee', 'department'])
            ->orderByRaw('CASE WHEN sla_breached_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('first_response_due_at')
            ->limit(40)
            ->get()
            ->map(fn (SupportTicket $t) => [
                'id' => $t->id,
                'ticket_number' => $t->ticket_number,
                'subject' => $t->subject,
                'status' => $t->status,
                'priority' => $t->priority,
                'assignee_name' => $t->assignee?->name,
                'department_name' => $t->department?->name_fa ?? $t->department?->name_en,
                'first_response_due_at' => optional($t->first_response_due_at)?->toIso8601String(),
                'resolve_due_at' => optional($t->resolve_due_at)?->toIso8601String(),
                'first_response_at' => optional($t->first_response_at)?->toIso8601String(),
                'sla_breached_at' => optional($t->sla_breached_at)?->toIso8601String(),
                'sla_breach_type' => $t->sla_breach_type,
                'sla_alerted_at' => optional($t->sla_alerted_at)?->toIso8601String(),
            ])
            ->all();

        return [
            'open' => (clone $open)->count(),
            'breached' => $breached,
            'due_soon' => $dueSoon,
            'policies' => SupportSlaPolicy::query()->where('tenant_id', $tenantId)->where('is_active', true)->count(),
            'rows' => $rows,
        ];
    }

    private function notifyBreach(SupportTicket $ticket, ?SupportSlaPolicy $policy, bool $warning): void
    {
        $targets = array_filter([
            $ticket->assignee_id,
            $policy?->escalate_to_user_id,
        ]);
        $title = $warning
            ? __('api.ticket_sla_warning')
            : __('api.ticket_sla_breached');
        foreach (array_unique($targets) as $uid) {
            UserNotification::query()->create([
                'tenant_id' => $ticket->tenant_id,
                'user_id' => (int) $uid,
                'type' => 'ticket',
                'title' => $title,
                'body' => $ticket->subject,
                'link' => '/dashboard/tickets/'.$ticket->id,
                'created_at' => now(),
            ]);
        }
    }

    private function addMinutes(Carbon $from, int $minutes, SupportSlaPolicy $policy, int $tenantId): Carbon
    {
        if (! $policy->business_hours_only) {
            return $from->copy()->addMinutes($minutes);
        }
        $settings = OnlineSupportSettings::get($tenantId);
        $cursor = $from->copy();
        $remaining = $minutes;
        $guard = 0;
        while ($remaining > 0 && $guard < 10000) {
            $guard++;
            if (OnlineSupportSettings::isWithinHours($settings, $cursor)) {
                $cursor->addMinute();
                $remaining--;
            } else {
                $cursor->addMinute();
            }
        }

        return $cursor;
    }
}
