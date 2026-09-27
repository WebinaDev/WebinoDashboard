<?php

namespace App\Services\Auth;

use App\Models\BotSession;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Bots\BotClientFactory;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Support\Facades\Mail;

final class OtpDeliveryService
{
    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $payload
     * @return array{channels_sent: list<string>, masked_destinations: array<string, string>}
     */
    public function deliver(
        Tenant $tenant,
        ?User $user,
        array $settings,
        array $payload,
        string $message,
    ): array {
        $channels = is_array($settings['otp_channels'] ?? null) ? $settings['otp_channels'] : [];
        $sent = [];
        $masked = [];

        $phone = (string) ($payload['phone'] ?? '');
        if ($user && $phone === '' && filled($user->phone)) {
            $phone = (string) $user->phone;
        }

        $email = (string) ($payload['email'] ?? '');
        if ($user && $email === '' && filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            $email = strtolower((string) $user->email);
        }

        if (! empty($channels['sms']) && $phone !== '' && ! empty($settings['enabled'])) {
            if ($this->sendSms($tenant, $settings, $phone, $message)) {
                $sent[] = 'sms';
                $masked['sms'] = $this->maskPhone($phone);
            }
        }

        if (! empty($channels['email']) && $email !== '') {
            if ($this->sendEmail($tenant, $email, $message)) {
                $sent[] = 'email';
                $masked['email'] = $this->maskEmail($email);
            }
        }

        if ($user) {
            foreach (['bale', 'telegram'] as $provider) {
                if (empty($channels[$provider])) {
                    continue;
                }
                if ($this->sendBot($tenant, $user, $provider, $message)) {
                    $sent[] = $provider;
                    $masked[$provider] = __("auth.otp_channel_{$provider}");
                }
            }
        }

        return [
            'channels_sent' => array_values(array_unique($sent)),
            'masked_destinations' => $masked,
        ];
    }

    /** @param  array<string, mixed>  $settings */
    private function sendSms(Tenant $tenant, array $settings, string $phone, string $message): bool
    {
        $from = (string) ($settings['sender_line_service'] ?? '');
        $body = [
            'message' => $message,
            'recipients' => [$phone],
        ];
        if ($from !== '') {
            $body['from_number'] = $from;
        }

        $result = app(ModirPayamakClient::class)->post($tenant, 'send', $body);
        $data = is_array($result['data'] ?? null) ? $result['data'] : [];

        return ! empty($result['ok']) && empty($data['unavailable']);
    }

    private function sendEmail(Tenant $tenant, string $email, string $message): bool
    {
        $siteName = (string) ($tenant->store_display_name ?: $tenant->name);
        $subject = __('auth.otp_email_subject', ['site' => $siteName]);

        try {
            Mail::html('<p>'.e($message).'</p>', function ($mail) use ($email, $subject): void {
                $mail->to($email)->subject($subject);
            });

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function sendBot(Tenant $tenant, User $user, string $provider, string $message): bool
    {
        $client = BotClientFactory::forTenant((int) $tenant->id, $provider);
        if (! $client) {
            return false;
        }

        $session = BotSession::query()
            ->where('tenant_id', $tenant->id)
            ->where('provider', $provider)
            ->where('user_id', $user->id)
            ->orderByDesc('last_seen_at')
            ->first();

        if (! $session || ! filled($session->chat_id)) {
            return false;
        }

        $res = $client->sendMessage((string) $session->chat_id, 'text', $message);
        $ok = ! empty($res['ok']);
        BotClientFactory::log(
            (int) $tenant->id,
            $provider,
            (string) $session->chat_id,
            'text',
            $message,
            $ok ? 'sent' : 'failed',
        );

        return $ok;
    }

    private function maskPhone(string $phone): string
    {
        $phone = preg_replace('/\D+/', '', $phone) ?? '';
        $len = strlen($phone);
        if ($len <= 4) {
            return str_repeat('*', $len);
        }

        return str_repeat('*', max(0, $len - 4)).substr($phone, -4);
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email, 2);
        if (count($parts) !== 2) {
            return '***';
        }
        $local = $parts[0];
        $keep = min(2, max(1, (int) floor(strlen($local) / 3)));

        return substr($local, 0, $keep).'***@'.$parts[1];
    }
}
