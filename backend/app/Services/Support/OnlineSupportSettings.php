<?php

namespace App\Services\Support;

use App\Services\Modules\ModuleSettingsService;

final class OnlineSupportSettings
{
    public const MODULE = 'settings';

    public const KEY = 'support.online';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => false,
            'position' => 'bottom-right',
            'primary_color' => '#0f766e',
            'launcher_label_fa' => 'پشتیبانی',
            'launcher_label_en' => 'Support',
            'greeting_fa' => 'سلام! چطور می‌توانیم کمکتان کنیم؟',
            'greeting_en' => 'Hi! How can we help you?',
            'avatar_url' => null,
            'show_agent_name' => true,
            'agent_name_fa' => 'پشتیبان آنلاین',
            'agent_name_en' => 'Online support',
            'hours' => [
                'enabled' => false,
                'timezone' => 'Asia/Tehran',
                'schedule' => [
                    'sat' => ['09:00', '21:00'],
                    'sun' => ['09:00', '21:00'],
                    'mon' => ['09:00', '21:00'],
                    'tue' => ['09:00', '21:00'],
                    'wed' => ['09:00', '21:00'],
                    'thu' => ['09:00', '21:00'],
                    'fri' => null,
                ],
            ],
            'offline' => [
                'message_fa' => 'خارج از ساعات پاسخگویی هستیم. پیام بگذارید تا پیگیری کنیم.',
                'message_en' => 'We are offline. Leave a message and we will follow up.',
                'form_enabled' => true,
                'create_ticket' => true,
                'default_department_id' => null,
            ],
            'channels' => [
                'ticket' => ['enabled' => true],
                'live_chat' => ['enabled' => true],
                'telegram' => ['enabled' => false, 'url' => ''],
                'bale' => ['enabled' => false, 'url' => ''],
                'whatsapp' => ['enabled' => false, 'url' => ''],
                'phone' => ['enabled' => false, 'number' => ''],
                'email' => ['enabled' => false, 'address' => ''],
            ],
            'pages' => [
                'show_on_all' => true,
                'hide_paths' => ['/checkout', '/cart'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function get(int $tenantId): array
    {
        $stored = app(ModuleSettingsService::class)->get($tenantId, self::MODULE, self::KEY, []);

        return array_replace_recursive(self::defaults(), is_array($stored) ? $stored : []);
    }

    /** @param  array<string, mixed>  $input */
    public static function put(int $tenantId, array $input): array
    {
        $current = self::get($tenantId);
        $next = array_replace_recursive($current, $input);
        $next['enabled'] = (bool) ($next['enabled'] ?? false);
        $pos = (string) ($next['position'] ?? 'bottom-right');
        $next['position'] = in_array($pos, ['bottom-right', 'bottom-left'], true) ? $pos : 'bottom-right';
        $color = (string) ($next['primary_color'] ?? '#0f766e');
        $next['primary_color'] = preg_match('/^#[0-9A-Fa-f]{6}$/', $color) ? $color : '#0f766e';
        foreach (['launcher_label_fa', 'launcher_label_en', 'greeting_fa', 'greeting_en', 'agent_name_fa', 'agent_name_en'] as $k) {
            $next[$k] = mb_substr(trim((string) ($next[$k] ?? '')), 0, 240);
        }
        $avatar = $next['avatar_url'] ?? null;
        $next['avatar_url'] = is_string($avatar) && $avatar !== '' ? mb_substr($avatar, 0, 500) : null;
        $next['show_agent_name'] = (bool) ($next['show_agent_name'] ?? true);
        data_set($next, 'hours.enabled', (bool) data_get($next, 'hours.enabled', false));
        data_set($next, 'hours.timezone', (string) (data_get($next, 'hours.timezone') ?: 'Asia/Tehran'));
        data_set($next, 'offline.form_enabled', (bool) data_get($next, 'offline.form_enabled', true));
        data_set($next, 'offline.create_ticket', (bool) data_get($next, 'offline.create_ticket', true));
        $dept = data_get($next, 'offline.default_department_id');
        data_set($next, 'offline.default_department_id', $dept !== null && $dept !== '' ? (int) $dept : null);
        data_set($next, 'pages.show_on_all', (bool) data_get($next, 'pages.show_on_all', true));
        $hide = data_get($next, 'pages.hide_paths', []);
        data_set($next, 'pages.hide_paths', array_values(array_filter(array_map(
            fn ($p) => is_string($p) ? mb_substr($p, 0, 120) : '',
            is_array($hide) ? $hide : []
        ))));

        foreach (['ticket', 'live_chat', 'telegram', 'bale', 'whatsapp', 'phone', 'email'] as $ch) {
            data_set($next, "channels.$ch.enabled", (bool) data_get($next, "channels.$ch.enabled", false));
        }
        // Ticket channel on by default when widget enabled unless explicitly off.
        if ($next['enabled'] && ! array_key_exists('ticket', (array) ($input['channels'] ?? []))) {
            data_set($next, 'channels.ticket.enabled', (bool) data_get($next, 'channels.ticket.enabled', true));
        }

        app(ModuleSettingsService::class)->put($tenantId, self::MODULE, self::KEY, $next);

        return $next;
    }

    /** @param  array<string, mixed>  $settings */
    public static function isWithinHours(array $settings, ?\DateTimeInterface $now = null): bool
    {
        if (! data_get($settings, 'hours.enabled')) {
            return true;
        }
        try {
            $tz = new \DateTimeZone((string) data_get($settings, 'hours.timezone', 'Asia/Tehran'));
        } catch (\Throwable) {
            $tz = new \DateTimeZone('Asia/Tehran');
        }
        $dt = $now ? \DateTimeImmutable::createFromInterface($now)->setTimezone($tz) : new \DateTimeImmutable('now', $tz);
        $map = ['Sun' => 'sun', 'Mon' => 'mon', 'Tue' => 'tue', 'Wed' => 'wed', 'Thu' => 'thu', 'Fri' => 'fri', 'Sat' => 'sat'];
        $day = $map[$dt->format('D')] ?? 'mon';
        $range = data_get($settings, "hours.schedule.$day");
        if (! is_array($range) || count($range) < 2) {
            return false;
        }
        $start = (string) $range[0];
        $end = (string) $range[1];
        $cur = $dt->format('H:i');

        return $cur >= $start && $cur <= $end;
    }

    /** Public-safe payload for the storefront float. */
    /** @return array<string, mixed> */
    public static function public(int $tenantId): array
    {
        $s = self::get($tenantId);
        if (! $s['enabled']) {
            return ['enabled' => false];
        }
        $online = self::isWithinHours($s);

        return [
            'enabled' => true,
            'online' => $online,
            'position' => $s['position'],
            'primary_color' => $s['primary_color'],
            'launcher_label_fa' => $s['launcher_label_fa'],
            'launcher_label_en' => $s['launcher_label_en'],
            'greeting_fa' => $s['greeting_fa'],
            'greeting_en' => $s['greeting_en'],
            'avatar_url' => $s['avatar_url'],
            'show_agent_name' => $s['show_agent_name'],
            'agent_name_fa' => $s['agent_name_fa'],
            'agent_name_en' => $s['agent_name_en'],
            'offline' => [
                'message_fa' => data_get($s, 'offline.message_fa'),
                'message_en' => data_get($s, 'offline.message_en'),
                'form_enabled' => (bool) data_get($s, 'offline.form_enabled'),
            ],
            'channels' => $s['channels'],
            'pages' => $s['pages'],
        ];
    }
}
