<?php

namespace App\Services\Bots;

/**
 * Tries primary Bot API token, then mirror tokens, on transport / 5xx / 429 failures.
 * Permanent client errors (other 4xx) are not retried on mirrors.
 */
final class FailoverBotClient implements BotClient
{
    /** @param  list<BotClient>  $clients */
    public function __construct(private array $clients)
    {
        if ($this->clients === []) {
            throw new \InvalidArgumentException('FailoverBotClient requires at least one client');
        }
    }

    public function call(string $method, array $payload): array
    {
        $last = ['ok' => false, 'body' => ['description' => 'no_client'], 'status' => 0];
        foreach ($this->clients as $i => $client) {
            $last = $client->call($method, $payload);
            if (! empty($last['ok'])) {
                return $last;
            }
            if ($i < count($this->clients) - 1 && self::shouldFailover($last)) {
                continue;
            }

            return $last;
        }

        return $last;
    }

    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
    {
        $last = ['ok' => false, 'body' => ['description' => 'no_client'], 'status' => 0];
        foreach ($this->clients as $i => $client) {
            $last = $client->sendMessage($chatId, $type, $text, $media);
            if (! empty($last['ok'])) {
                return $last;
            }
            if ($i < count($this->clients) - 1 && self::shouldFailover($last)) {
                continue;
            }

            return $last;
        }

        return $last;
    }

    /** @param  array{ok?: bool, status?: int, body?: mixed}  $res */
    public static function shouldFailover(array $res): bool
    {
        $status = (int) ($res['status'] ?? 0);
        if ($status === 0 || $status === 429 || $status >= 500) {
            return true;
        }
        // Auth / forbidden on primary → try mirror (token banned / revoked).
        if (in_array($status, [401, 403], true)) {
            return true;
        }

        return false;
    }
}
