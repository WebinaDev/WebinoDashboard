<?php

namespace App\Services\Bots;

use App\Models\BotBroadcastJob;
use App\Models\BotCampaign;
use App\Models\BotImportedContact;
use App\Models\BotSession;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BroadcastService
{
    public function currentJob(int $tenantId, string $provider): ?BotBroadcastJob
    {
        return BotBroadcastJob::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->latest('id')
            ->first();
    }

    /**
     * @param  array{type?: string, text?: string, media?: string, segment?: string, campaign_id?: int}  $payload
     */
    public function start(int $tenantId, string $provider, array $payload): BotBroadcastJob
    {
        $active = BotBroadcastJob::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->where('active', true)
            ->exists();
        if ($active) {
            throw ValidationException::withMessages(['broadcast' => 'A broadcast is already running']);
        }

        $chatIds = $this->resolveAudience($tenantId, $provider, $payload['segment'] ?? 'all', $payload['campaign_id'] ?? null);
        $job = BotBroadcastJob::query()->create([
            'tenant_id' => $tenantId,
            'provider' => $provider,
            'active' => true,
            'status' => 'running',
            'type' => $payload['type'] ?? 'text',
            'text' => $payload['text'] ?? '',
            'media' => $payload['media'] ?? null,
            'segment' => $payload['segment'] ?? 'all',
            'campaign_id' => $payload['campaign_id'] ?? null,
            'total' => count($chatIds),
            'sent' => 0,
            'failed' => 0,
            'cursor' => 0,
            'chat_ids' => $chatIds,
        ]);

        ProcessBroadcastJob::dispatch($job->id);

        return $job;
    }

    public function cancel(int $tenantId, string $provider): ?BotBroadcastJob
    {
        $job = BotBroadcastJob::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->where('active', true)
            ->latest('id')
            ->first();
        if ($job) {
            $job->update(['active' => false, 'status' => 'cancelled']);
        }

        return $job;
    }

    public function tick(BotBroadcastJob $job, int $batch = 25): void
    {
        if (! $job->active || $job->status !== 'running') {
            return;
        }
        $client = BotClientFactory::forTenant($job->tenant_id, $job->provider);
        if (! $client) {
            $job->update(['active' => false, 'status' => 'failed', 'last_error' => 'Bot not configured']);

            return;
        }

        $ids = $job->chat_ids ?? [];
        $slice = array_slice($ids, $job->cursor, $batch);
        $sent = $job->sent;
        $failed = $job->failed;

        foreach ($slice as $chatId) {
            try {
                $res = $client->sendMessage((string) $chatId, $job->type, (string) $job->text, $job->media);
                if ($res['ok'] ?? false) {
                    $sent++;
                    BotClientFactory::log($job->tenant_id, $job->provider, (string) $chatId, $job->type, (string) $job->text, 'sent');
                } else {
                    $failed++;
                    BotClientFactory::log($job->tenant_id, $job->provider, (string) $chatId, $job->type, (string) $job->text, 'failed');
                }
            } catch (\Throwable $e) {
                $failed++;
                $job->last_error = $e->getMessage();
            }
        }

        $cursor = $job->cursor + count($slice);
        $done = $cursor >= count($ids);
        $job->update([
            'cursor' => $cursor,
            'sent' => $sent,
            'failed' => $failed,
            'active' => ! $done,
            'status' => $done ? 'finished' : 'running',
            'last_error' => $job->last_error,
        ]);

        if ($job->campaign_id) {
            BotCampaign::query()->whereKey($job->campaign_id)->update([
                'sent' => $sent,
                'failed' => $failed,
                'status' => $done ? 'finished' : 'running',
            ]);
        }

        if (! $done && $job->fresh()->active) {
            ProcessBroadcastJob::dispatch($job->id)->delay(now()->addSeconds(2));
        }
    }

    /** @return list<string> */
    protected function resolveAudience(int $tenantId, string $provider, string $segment, ?int $campaignId): array
    {
        if ($campaignId) {
            $campaign = BotCampaign::query()->where('tenant_id', $tenantId)->whereKey($campaignId)->first();
            if ($campaign && $campaign->audience === 'imported') {
                return BotImportedContact::query()
                    ->where('tenant_id', $tenantId)
                    ->where('provider', $provider)
                    ->whereNotNull('chat_id')
                    ->pluck('chat_id')
                    ->map(fn ($c) => (string) $c)
                    ->unique()
                    ->values()
                    ->all();
            }
            if ($campaign && is_array($campaign->user_ids) && count($campaign->user_ids)) {
                return BotSession::query()
                    ->where('tenant_id', $tenantId)
                    ->where('provider', $provider)
                    ->whereIn('user_id', $campaign->user_ids)
                    ->pluck('chat_id')
                    ->map(fn ($c) => (string) $c)
                    ->unique()
                    ->values()
                    ->all();
            }
        }

        $q = BotSession::query()->where('tenant_id', $tenantId)->where('provider', $provider);

        if ($segment === 'buyers') {
            $buyerIds = Order::query()
                ->where('tenant_id', $tenantId)
                ->whereIn('status', ['paid', 'processing', 'completed', 'shipped'])
                ->whereNotNull('user_id')
                ->pluck('user_id')
                ->unique();
            $q->whereIn('user_id', $buyerIds);
        } elseif ($segment === 'never_bought') {
            $buyerIds = Order::query()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('user_id')
                ->pluck('user_id')
                ->unique();
            $q->where(function ($w) use ($buyerIds) {
                $w->whereNull('user_id')->orWhereNotIn('user_id', $buyerIds);
            });
        } elseif ($segment === 'recent') {
            $q->where('last_seen_at', '>=', now()->subDays(7));
        } elseif ($segment === 'inactive_30') {
            $q->where(function ($w) {
                $w->whereNull('last_seen_at')->orWhere('last_seen_at', '<', now()->subDays(30));
            });
        } elseif ($segment === 'vip') {
            $vipIds = Order::query()
                ->where('tenant_id', $tenantId)
                ->whereIn('status', ['paid', 'processing', 'completed'])
                ->select('user_id', DB::raw('sum(total_minor) as revenue'))
                ->groupBy('user_id')
                ->having('revenue', '>=', 5_000_000)
                ->pluck('user_id');
            $q->whereIn('user_id', $vipIds);
        }

        return $q->pluck('chat_id')->map(fn ($c) => (string) $c)->unique()->values()->all();
    }
}
