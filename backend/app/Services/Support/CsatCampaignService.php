<?php

namespace App\Services\Support;

use App\Models\SupportCsatCampaign;
use App\Models\SupportTicket;
use App\Models\UserNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class CsatCampaignService
{
    public function defaultCampaign(int $tenantId): ?SupportCsatCampaign
    {
        return SupportCsatCampaign::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();
    }

    public function queueOnResolve(SupportTicket $ticket): void
    {
        if ($ticket->csat_rating || $ticket->csat_token) {
            return;
        }
        $campaign = $this->defaultCampaign((int) $ticket->tenant_id);
        if (! $campaign) {
            return;
        }
        $ticket->csat_campaign_id = $campaign->id;
        $ticket->csat_token = Str::random(40);
        $ticket->csat_requested_at = null;
        $ticket->save();
    }

    /** Send due CSAT invitations. @return int */
    public function dispatchDue(int $tenantId): int
    {
        $sent = 0;
        SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'closed')
            ->whereNotNull('csat_token')
            ->whereNull('csat_rating')
            ->whereNull('csat_requested_at')
            ->whereNotNull('csat_campaign_id')
            ->with('user')
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->each(function (SupportTicket $ticket) use (&$sent) {
                $campaign = SupportCsatCampaign::query()->find($ticket->csat_campaign_id);
                if (! $campaign || ! $campaign->is_active) {
                    return;
                }
                $resolved = $ticket->resolved_at ?? $ticket->updated_at;
                $due = Carbon::parse($resolved)->addMinutes((int) $campaign->delay_minutes);
                if (Carbon::now()->lt($due)) {
                    return;
                }
                $this->deliver($ticket, $campaign);
                $ticket->csat_requested_at = now();
                $ticket->save();
                $sent++;
            });

        return $sent;
    }

    public function deliver(SupportTicket $ticket, SupportCsatCampaign $campaign): void
    {
        $channels = $campaign->channels ?? ['notification' => true];
        if (($channels['notification'] ?? true) && $ticket->user_id) {
            UserNotification::query()->create([
                'tenant_id' => $ticket->tenant_id,
                'user_id' => (int) $ticket->user_id,
                'type' => 'ticket',
                'title' => $campaign->question_fa ?: $campaign->question_en,
                'body' => $ticket->subject,
                'link' => '/dashboard/account/tickets/'.$ticket->id.'?csat='.$ticket->csat_token,
                'created_at' => now(),
            ]);
        }
        // Email channel is recorded for future mailer wiring; token still usable via public API.
    }

    /**
     * @return array<string, mixed>
     */
    public function publicSurvey(string $token): ?array
    {
        $ticket = SupportTicket::query()->where('csat_token', $token)->first();
        if (! $ticket) {
            return null;
        }
        $campaign = $ticket->csat_campaign_id
            ? SupportCsatCampaign::query()->find($ticket->csat_campaign_id)
            : null;

        return [
            'ticket_number' => $ticket->ticket_number,
            'subject' => $ticket->subject,
            'already_rated' => (bool) $ticket->csat_rating,
            'rating' => $ticket->csat_rating,
            'question_fa' => $campaign?->question_fa ?? 'از این پشتیبانی چقدر راضی بودید؟',
            'question_en' => $campaign?->question_en ?? 'How satisfied were you with this support?',
            'thank_you_fa' => $campaign?->thank_you_fa,
            'thank_you_en' => $campaign?->thank_you_en,
        ];
    }

    public function submit(string $token, int $rating, ?string $comment = null): ?SupportTicket
    {
        $ticket = SupportTicket::query()->where('csat_token', $token)->first();
        if (! $ticket || $ticket->csat_rating) {
            return $ticket;
        }
        $ticket->csat_rating = max(1, min(5, $rating));
        $ticket->csat_comment = $comment ? mb_substr($comment, 0, 2000) : null;
        $ticket->csat_at = now();
        $ticket->save();
        app(SupportTicketService::class)->recordEvent($ticket, $ticket->user_id, 'csat', [
            'rating' => $ticket->csat_rating,
        ]);

        return $ticket;
    }

    /** @return array<string, mixed> */
    public function report(int $tenantId, int $days = 30): array
    {
        $since = now()->subDays(max(1, min(365, $days)));
        $base = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('csat_rating')
            ->where('csat_at', '>=', $since);

        $count = (clone $base)->count();
        $avg = $count ? round((float) (clone $base)->avg('csat_rating'), 2) : null;
        $distribution = [];
        for ($i = 1; $i <= 5; $i++) {
            $distribution[$i] = (clone $base)->where('csat_rating', $i)->count();
        }
        $requested = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('csat_requested_at')
            ->where('csat_requested_at', '>=', $since)
            ->count();
        $responseRate = $requested > 0 ? round(($count / $requested) * 100, 1) : null;

        $recent = SupportTicket::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('csat_rating')
            ->orderByDesc('csat_at')
            ->limit(20)
            ->get(['id', 'ticket_number', 'subject', 'csat_rating', 'csat_comment', 'csat_at'])
            ->map(fn (SupportTicket $t) => [
                'id' => $t->id,
                'ticket_number' => $t->ticket_number,
                'subject' => $t->subject,
                'rating' => $t->csat_rating,
                'comment' => $t->csat_comment,
                'at' => optional($t->csat_at)?->toIso8601String(),
            ])
            ->all();

        return [
            'days' => $days,
            'count' => $count,
            'average' => $avg,
            'distribution' => $distribution,
            'requested' => $requested,
            'response_rate' => $responseRate,
            'recent' => $recent,
        ];
    }
}
