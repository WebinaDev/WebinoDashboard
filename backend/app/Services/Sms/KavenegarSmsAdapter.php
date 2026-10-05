<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;

class KavenegarSmsAdapter
{
    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, message_id?: string, error?: string}
     */
    public function send(array $settings, array $payload): array
    {
        $apiKey = (string) ($settings['api_key'] ?? '');
        $sender = (string) ($settings['sender'] ?? '');
        $to = (string) ($payload['to'] ?? $payload['mobile'] ?? '');
        $message = (string) ($payload['message'] ?? $payload['text'] ?? '');
        if ($apiKey === '' || $sender === '' || $to === '' || $message === '') {
            return ['ok' => false, 'error' => 'missing_fields'];
        }

        $response = Http::timeout(25)
            ->asForm()
            ->post('https://api.kavenegar.com/v1/'.$apiKey.'/sms/send.json', [
                'sender' => $sender,
                'receptor' => $to,
                'message' => $message,
            ]);

        if (! $response->successful()) {
            return ['ok' => false, 'error' => 'http_'.$response->status()];
        }

        $id = data_get($response->json(), 'entries.0.messageid');

        return ['ok' => true, 'message_id' => $id !== null ? (string) $id : ''];
    }
}
