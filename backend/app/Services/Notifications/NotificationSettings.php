<?php

namespace App\Services\Notifications;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Crypt;

final class NotificationSettings
{
    public const MODULE = 'settings';

    public const KEY = 'site.notifications';

    public const CHANNELS = ['site', 'sms', 'bale', 'telegram', 'email'];

    public const EVENTS = [
        'order_status',
        'return_requested',
        'return_approved',
        'return_rejected',
        'user_welcome',
        'stock_low',
        'stock_out',
        'review_pending',
    ];

    private const CUSTOMER_EVENTS = ['order_status', 'return_requested', 'return_approved', 'return_rejected', 'user_welcome'];

    private const ADMIN_EVENTS = ['return_requested', 'stock_low', 'stock_out', 'review_pending'];

    private const MASK = '••••••••';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        $channels = [];
        foreach (self::CHANNELS as $channel) {
            $events = [];
            foreach (self::EVENTS as $event) {
                $events[$event] = [
                    'customer' => self::defaultAudience($channel, $event, 'customer'),
                    'admin' => self::defaultAudience($channel, $event, 'admin'),
                    'customer_template' => '',
                    'admin_template' => '',
                ];
            }
            $channels[$channel] = [
                'enabled' => in_array($channel, ['site', 'email'], true),
                'events' => $events,
            ];
        }
        $channels['sms']['admin_phone'] = '';
        $channels['bale']['admin_chat_id'] = '';
        $channels['telegram']['admin_chat_id'] = '';
        $channels['email']['admin_email'] = '';

        return [
            'channels' => $channels,
            'smtp' => [
                'enabled' => false,
                'host' => '',
                'port' => 587,
                'username' => '',
                'password' => '',
                'encryption' => 'tls',
                'from_address' => '',
                'from_name' => '',
            ],
        ];
    }

    private static function defaultAudience(string $channel, string $event, string $audience): bool
    {
        if ($channel === 'site') {
            return in_array($event, $audience === 'customer' ? self::CUSTOMER_EVENTS : self::ADMIN_EVENTS, true);
        }
        if ($channel === 'email') {
            return $audience === 'customer' && $event === 'order_status';
        }

        return false;
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY);
        $merged = array_replace_recursive(self::defaults(), is_array($stored) ? $stored : []);
        $password = (string) ($merged['smtp']['password'] ?? '');
        if (str_starts_with($password, 'enc:')) {
            try {
                $merged['smtp']['password'] = Crypt::decryptString(substr($password, 4));
            } catch (\Throwable) {
                $merged['smtp']['password'] = '';
            }
        }

        return $merged;
    }

    /** @return array<string, mixed> */
    public static function public(int $tenantId): array
    {
        $data = self::get($tenantId);
        $hasPassword = filled($data['smtp']['password'] ?? '');
        $data['smtp']['password'] = $hasPassword ? self::MASK : '';
        $data['smtp']['has_password'] = $hasPassword;

        return $data;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function save(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $clean = self::sanitize($input, $current);
        $toStore = $clean;
        $password = (string) ($clean['smtp']['password'] ?? '');
        $toStore['smtp']['password'] = $password !== '' ? 'enc:'.Crypt::encryptString($password) : '';
        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $toStore);

        return self::public($tenantId);
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    public static function sanitize(array $input, array $current): array
    {
        $d = self::defaults();
        $channelsIn = is_array($input['channels'] ?? null) ? $input['channels'] : [];
        $channels = [];
        foreach (self::CHANNELS as $channel) {
            $in = is_array($channelsIn[$channel] ?? null) ? $channelsIn[$channel] : [];
            $prev = $current['channels'][$channel] ?? $d['channels'][$channel];
            $eventsIn = is_array($in['events'] ?? null) ? $in['events'] : [];
            $events = [];
            foreach (self::EVENTS as $event) {
                $e = is_array($eventsIn[$event] ?? null) ? $eventsIn[$event] : [];
                $p = $prev['events'][$event] ?? $d['channels'][$channel]['events'][$event];
                $events[$event] = [
                    'customer' => filter_var($e['customer'] ?? $p['customer'], FILTER_VALIDATE_BOOLEAN),
                    'admin' => filter_var($e['admin'] ?? $p['admin'], FILTER_VALIDATE_BOOLEAN),
                    'customer_template' => mb_substr((string) ($e['customer_template'] ?? $p['customer_template']), 0, 2000),
                    'admin_template' => mb_substr((string) ($e['admin_template'] ?? $p['admin_template']), 0, 2000),
                ];
            }
            $row = [
                'enabled' => filter_var($in['enabled'] ?? $prev['enabled'], FILTER_VALIDATE_BOOLEAN),
                'events' => $events,
            ];
            foreach (['admin_phone', 'admin_chat_id', 'admin_email'] as $extra) {
                if (array_key_exists($extra, $d['channels'][$channel])) {
                    $row[$extra] = mb_substr(trim((string) ($in[$extra] ?? $prev[$extra] ?? '')), 0, 255);
                }
            }
            $channels[$channel] = $row;
        }

        $smtpIn = is_array($input['smtp'] ?? null) ? $input['smtp'] : [];
        $smtpPrev = $current['smtp'] ?? $d['smtp'];
        $password = (string) ($smtpIn['password'] ?? '');
        if ($password === '' || str_contains($password, '•')) {
            $password = (string) ($smtpPrev['password'] ?? '');
        }
        if (! empty($smtpIn['clear_password'])) {
            $password = '';
        }
        $encryption = strtolower((string) ($smtpIn['encryption'] ?? $smtpPrev['encryption'] ?? 'tls'));
        if (! in_array($encryption, ['tls', 'ssl', 'none'], true)) {
            $encryption = 'tls';
        }
        $from = trim((string) ($smtpIn['from_address'] ?? $smtpPrev['from_address'] ?? ''));

        return [
            'channels' => $channels,
            'smtp' => [
                'enabled' => filter_var($smtpIn['enabled'] ?? $smtpPrev['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'host' => mb_substr(trim((string) ($smtpIn['host'] ?? $smtpPrev['host'] ?? '')), 0, 255),
                'port' => max(1, min(65535, (int) ($smtpIn['port'] ?? $smtpPrev['port'] ?? 587))),
                'username' => mb_substr(trim((string) ($smtpIn['username'] ?? $smtpPrev['username'] ?? '')), 0, 255),
                'password' => $password,
                'encryption' => $encryption,
                'from_address' => filter_var($from, FILTER_VALIDATE_EMAIL) ? $from : '',
                'from_name' => mb_substr(trim((string) ($smtpIn['from_name'] ?? $smtpPrev['from_name'] ?? '')), 0, 120),
            ],
        ];
    }
}
