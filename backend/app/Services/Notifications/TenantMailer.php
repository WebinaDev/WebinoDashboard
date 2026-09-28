<?php

namespace App\Services\Notifications;

use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

final class TenantMailer
{
    public function mailer(int $tenantId): Mailer
    {
        $smtp = NotificationSettings::get($tenantId)['smtp'] ?? [];
        if (empty($smtp['enabled']) || ! filled($smtp['host'] ?? '')) {
            return Mail::mailer();
        }

        $encryption = (string) ($smtp['encryption'] ?? 'tls');
        $config = [
            'transport' => 'smtp',
            'host' => (string) $smtp['host'],
            'port' => (int) ($smtp['port'] ?? 587),
            'username' => filled($smtp['username'] ?? '') ? (string) $smtp['username'] : null,
            'password' => filled($smtp['password'] ?? '') ? (string) $smtp['password'] : null,
            'timeout' => 20,
        ];
        if ($encryption === 'ssl') {
            $config['scheme'] = 'smtps';
        } elseif ($encryption === 'none') {
            $config['scheme'] = 'smtp';
            $config['auto_tls'] = false;
        }

        $mailer = Mail::build($config);
        if (filled($smtp['from_address'] ?? '')) {
            $mailer->alwaysFrom((string) $smtp['from_address'], filled($smtp['from_name'] ?? '') ? (string) $smtp['from_name'] : null);
        }

        return $mailer;
    }

    /** @param  string|list<string>  $to */
    public function send(int $tenantId, string|array $to, string $subject, string $body): bool
    {
        $recipients = array_values(array_filter(
            is_array($to) ? $to : [$to],
            fn ($r) => filter_var($r, FILTER_VALIDATE_EMAIL)
        ));
        if ($recipients === []) {
            return false;
        }

        try {
            $this->mailer($tenantId)->raw($body, function ($message) use ($recipients, $subject): void {
                $message->to($recipients)->subject($subject);
            });

            return true;
        } catch (\Throwable $e) {
            Log::warning('tenant_mail_failed', ['tenant_id' => $tenantId, 'error' => $e->getMessage()]);

            return false;
        }
    }
}
