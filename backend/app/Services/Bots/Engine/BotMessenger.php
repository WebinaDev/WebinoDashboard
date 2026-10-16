<?php

namespace App\Services\Bots\Engine;

use App\Models\BotOutboundMessage;
use App\Services\Bots\BotClient;
use App\Services\Bots\BotClientFactory;

/**
 * Outbound sender with logging + retry queue (port of WP MessageRetryQueue / bots-outbound-queue).
 * Only user-visible sends (sendMessage/sendPhoto/…) are queued on failure; UI calls
 * (answerCallbackQuery, editMessage*) are best-effort.
 */
final class BotMessenger
{
    public const MAX_ATTEMPTS = 5;

    private const RETRYABLE = ['sendMessage', 'sendPhoto', 'sendVideo', 'sendDocument', 'sendVoice'];

    /** @param  array<string, mixed>  $payload */
    public static function call(int $tenantId, string $provider, ?BotClient $client, string $method, array $payload, bool $queueOnFail = true): array
    {
        $chatId = (string) ($payload['chat_id'] ?? '');
        if (! $client) {
            $client = BotClientFactory::forTenant($tenantId, $provider);
        }
        $res = $client ? $client->call($method, $payload) : ['ok' => false, 'body' => ['description' => 'bot_not_configured'], 'status' => 0];
        $ok = (bool) ($res['ok'] ?? false);
        if (in_array($method, self::RETRYABLE, true)) {
            BotClientFactory::log($tenantId, $provider, $chatId, $method, (string) ($payload['text'] ?? $payload['caption'] ?? ''), $ok ? 'sent' : 'failed');
            if (! $ok && $queueOnFail && $chatId !== '' && self::retryable($res)) {
                BotOutboundMessage::query()->create([
                    'tenant_id' => $tenantId,
                    'provider' => $provider,
                    'chat_id' => $chatId,
                    'method' => $method,
                    'payload' => $payload,
                    'status' => 'pending',
                    'attempts' => 1,
                    'last_error' => mb_substr((string) json_encode($res['body'] ?? null, JSON_UNESCAPED_UNICODE), 0, 1000),
                    'next_attempt_at' => now()->addMinute(),
                ]);
            }
        }

        return $res;
    }

    /** 4xx other than 429 are permanent (blocked bot, bad chat id); don't retry those. */
    private static function retryable(array $res): bool
    {
        $status = (int) ($res['status'] ?? 0);

        return $status === 0 || $status === 429 || $status >= 500;
    }

    /** Drain due rows with exponential backoff. Returns number sent. */
    public static function retryDue(int $limit = 50): int
    {
        $sent = 0;
        $rows = BotOutboundMessage::query()
            ->where('status', 'pending')
            ->where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->orderBy('id')
            ->limit($limit)
            ->get();
        foreach ($rows as $row) {
            $client = BotClientFactory::forTenant((int) $row->tenant_id, (string) $row->provider);
            $res = $client ? $client->call((string) $row->method, (array) $row->payload) : ['ok' => false, 'status' => 0, 'body' => 'bot_not_configured'];
            $attempts = (int) $row->attempts + 1;
            if (! empty($res['ok'])) {
                $row->update(['status' => 'sent', 'attempts' => $attempts, 'last_error' => null]);
                BotClientFactory::log((int) $row->tenant_id, (string) $row->provider, (string) $row->chat_id, (string) $row->method, (string) ($row->payload['text'] ?? $row->payload['caption'] ?? ''), 'sent');
                $sent++;

                continue;
            }
            $dead = $attempts >= self::MAX_ATTEMPTS || ! self::retryable($res);
            $row->update([
                'status' => $dead ? 'dead' : 'pending',
                'attempts' => $attempts,
                'last_error' => mb_substr((string) json_encode($res['body'] ?? null, JSON_UNESCAPED_UNICODE), 0, 1000),
                'next_attempt_at' => $dead ? null : now()->addMinutes(2 ** $attempts),
            ]);
        }

        return $sent;
    }
}
