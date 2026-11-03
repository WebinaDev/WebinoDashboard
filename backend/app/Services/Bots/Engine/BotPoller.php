<?php

namespace App\Services\Bots\Engine;

use App\Models\BotSetting;
use App\Services\Bots\BotClientFactory;
use Illuminate\Support\Facades\Log;

/**
 * Long-poll getUpdates for bots whose connection.mode is polling (webhook off).
 */
final class BotPoller
{
    public function __construct(private BotEngine $engine) {}

    /**
     * Poll every enabled bot in polling mode.
     *
     * @return array{bots: int, updates: int}
     */
    public function tick(int $limitPerBot = 50): array
    {
        $bots = 0;
        $updates = 0;
        BotSetting::query()
            ->where('enabled', true)
            ->whereNotNull('token')
            ->whereIn('provider', ['bale', 'telegram'])
            ->orderBy('id')
            ->get()
            ->each(function (BotSetting $setting) use ($limitPerBot, &$bots, &$updates) {
                $conn = is_array($setting->meta['connection'] ?? null) ? $setting->meta['connection'] : [];
                if (($conn['mode'] ?? 'webhook') !== 'polling') {
                    return;
                }
                if (! filled($setting->token)) {
                    return;
                }
                $bots++;
                $updates += $this->pollOne($setting, $limitPerBot);
            });

        return ['bots' => $bots, 'updates' => $updates];
    }

    public function pollOne(BotSetting $setting, int $limit = 50): int
    {
        $client = BotClientFactory::forSetting($setting);
        if (! $client) {
            return 0;
        }
        $meta = is_array($setting->meta) ? $setting->meta : [];
        $conn = is_array($meta['connection'] ?? null) ? $meta['connection'] : [];
        $offset = (int) ($conn['poll_offset'] ?? 0);

        // Ensure webhook is cleared so getUpdates works.
        if (empty($conn['poll_webhook_cleared'])) {
            $client->call('deleteWebhook', ['drop_pending_updates' => false]);
            $conn['poll_webhook_cleared'] = true;
            $meta['connection'] = $conn;
            $setting->update(['meta' => $meta]);
        }

        $res = $client->call('getUpdates', [
            'offset' => $offset,
            'limit' => max(1, min(100, $limit)),
            'timeout' => 0,
        ]);
        if (empty($res['ok'])) {
            Log::notice('bots.poll_failed', [
                'tenant_id' => $setting->tenant_id,
                'provider' => $setting->provider,
                'body' => $res['body'] ?? null,
            ]);

            return 0;
        }

        $list = data_get($res, 'body.result', []);
        if (! is_array($list) || $list === []) {
            return 0;
        }

        $n = 0;
        $maxUpdateId = $offset > 0 ? $offset - 1 : 0;
        foreach ($list as $update) {
            if (! is_array($update)) {
                continue;
            }
            $uid = (int) ($update['update_id'] ?? 0);
            if ($uid > $maxUpdateId) {
                $maxUpdateId = $uid;
            }
            try {
                $this->engine->handle($setting, $update, $client);
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $conn['poll_offset'] = $maxUpdateId + 1;
        $conn['poll_last_at'] = now()->toIso8601String();
        $meta['connection'] = $conn;
        $setting->update(['meta' => $meta]);

        return $n;
    }

    /** Switch a setting into polling mode and drop webhook. */
    public static function enablePolling(BotSetting $setting): void
    {
        $client = BotClientFactory::forSetting($setting);
        $client?->call('deleteWebhook', ['drop_pending_updates' => false]);
        $meta = is_array($setting->meta) ? $setting->meta : [];
        $conn = is_array($meta['connection'] ?? null) ? $meta['connection'] : [];
        $meta['connection'] = array_merge($conn, [
            'mode' => 'polling',
            'poll_webhook_cleared' => true,
        ]);
        $setting->update(['meta' => $meta]);
    }
}
