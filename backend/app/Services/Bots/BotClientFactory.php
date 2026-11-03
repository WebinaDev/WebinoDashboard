<?php

namespace App\Services\Bots;

use App\Models\BotMessageLog;
use App\Models\BotSetting;
use Illuminate\Support\Facades\Http;

interface BotClient
{
    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array;

    /**
     * Raw Bot API call (sendMessage with reply_markup, answerCallbackQuery, editMessageText, deleteMessage…).
     *
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, body: mixed, status: int}
     */
    public function call(string $method, array $payload): array;
}

abstract class HttpBotClient implements BotClient
{
    public function __construct(protected string $token, protected ?string $proxyUrl = null) {}

    abstract protected function baseUrl(): string;

    public function call(string $method, array $payload): array
    {
        try {
            $req = Http::timeout(20)->asJson();
            if (filled($this->proxyUrl)) {
                $req = $req->withOptions(['proxy' => $this->proxyUrl]);
            }
            $res = $req->post($this->baseUrl().$this->token.'/'.$method, $payload);
        } catch (\Throwable $e) {
            return ['ok' => false, 'body' => ['description' => $e->getMessage()], 'status' => 0];
        }
        $body = $res->json();

        return ['ok' => $res->successful() && (($body['ok'] ?? true) !== false), 'body' => $body, 'status' => $res->status()];
    }

    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
    {
        $payload = match ($type) {
            'photo' => ['chat_id' => $chatId, 'photo' => $media, 'caption' => $text],
            'video' => ['chat_id' => $chatId, 'video' => $media, 'caption' => $text],
            'voice' => ['chat_id' => $chatId, 'voice' => $media],
            'document' => ['chat_id' => $chatId, 'document' => $media, 'caption' => $text],
            default => ['chat_id' => $chatId, 'text' => $text],
        };
        $method = match ($type) {
            'photo' => 'sendPhoto',
            'video' => 'sendVideo',
            'voice' => 'sendVoice',
            'document' => 'sendDocument',
            default => 'sendMessage',
        };

        return $this->call($method, $payload);
    }
}

class BaleBotClient extends HttpBotClient
{
    protected function baseUrl(): string
    {
        return 'https://tapi.bale.ai/bot';
    }
}

class TelegramBotClient extends HttpBotClient
{
    protected function baseUrl(): string
    {
        return 'https://api.telegram.org/bot';
    }
}

class BotClientFactory
{
    public static function make(string $provider, string $token, ?string $proxyUrl = null): BotClient
    {
        return match ($provider) {
            'bale' => new BaleBotClient($token, $proxyUrl),
            'telegram' => new TelegramBotClient($token, $proxyUrl),
            default => throw new \InvalidArgumentException('Unknown bot provider'),
        };
    }

    public static function forTenant(int $tenantId, string $provider): ?BotClient
    {
        $row = BotSetting::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', $provider)
            ->where('enabled', true)
            ->first();
        if (! $row || ! $row->token) {
            return null;
        }
        $conn = is_array($row->meta['connection'] ?? null) ? $row->meta['connection'] : [];
        $token = $row->token;
        if (! empty($conn['sandbox']) && filled($conn['sandbox_token'] ?? null)) {
            $token = (string) $conn['sandbox_token'];
        }

        return self::make($provider, $token, isset($conn['proxy_url']) ? (string) $conn['proxy_url'] : null);
    }

    public static function log(int $tenantId, string $provider, string $chatId, string $type, string $payload, string $status, string $direction = 'out'): void
    {
        BotMessageLog::query()->create([
            'tenant_id' => $tenantId,
            'provider' => $provider,
            'chat_id' => $chatId,
            'direction' => $direction,
            'type' => $type,
            'payload' => $payload,
            'status' => $status,
        ]);
    }
}
