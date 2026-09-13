<?php

namespace App\Services\Bots;

use App\Models\BotMessageLog;
use App\Models\BotSetting;
use Illuminate\Support\Facades\Http;

interface BotClient
{
    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array;
}

class BaleBotClient implements BotClient
{
    public function __construct(protected string $token) {}

    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
    {
        $base = 'https://tapi.bale.ai/bot'.$this->token;
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
        $res = Http::timeout(20)->asJson()->post($base.'/'.$method, $payload);

        return ['ok' => $res->successful(), 'body' => $res->json(), 'status' => $res->status()];
    }
}

class TelegramBotClient implements BotClient
{
    public function __construct(protected string $token) {}

    public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
    {
        $base = 'https://api.telegram.org/bot'.$this->token;
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
        $res = Http::timeout(20)->asJson()->post($base.'/'.$method, $payload);

        return ['ok' => $res->successful(), 'body' => $res->json(), 'status' => $res->status()];
    }
}

class BotClientFactory
{
    public static function make(string $provider, string $token): BotClient
    {
        return match ($provider) {
            'bale' => new BaleBotClient($token),
            'telegram' => new TelegramBotClient($token),
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

        return self::make($provider, $row->token);
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
