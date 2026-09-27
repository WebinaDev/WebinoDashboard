<?php

namespace App\Services\Auth;

use App\Services\Modules\ModuleSettingsService;

final class OtpSettings
{
    public const KEY = 'site.sms';

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => false,
            'otp_login_enabled' => false,
            'otp_register_enabled' => false,
            'otp_expiry_minutes' => 5,
            'otp_length' => 5,
            'otp_max_attempts' => 5,
            'otp_login_template' => 'Code: {code}',
            'otp_register_template' => 'Registration code: {code}',
            'use_pattern_for_otp' => false,
            'sender_line_service' => '',
            'otp_channels' => [
                'sms' => true,
                'email' => true,
                'bale' => true,
                'telegram' => true,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function forTenant(int $tenantId, ModuleSettingsService $settings): array
    {
        $raw = $settings->get($tenantId, 'settings', self::KEY, self::defaults());
        $channels = is_array($raw['otp_channels'] ?? null) ? $raw['otp_channels'] : [];

        return [
            'enabled' => ! empty($raw['enabled']),
            'otp_login_enabled' => ! empty($raw['otp_login_enabled']),
            'otp_register_enabled' => ! empty($raw['otp_register_enabled']),
            'otp_expiry_minutes' => max(1, min(30, (int) ($raw['otp_expiry_minutes'] ?? 5))),
            'otp_length' => max(4, min(8, (int) ($raw['otp_length'] ?? 5))),
            'otp_max_attempts' => max(1, min(20, (int) ($raw['otp_max_attempts'] ?? 5))),
            'otp_login_template' => (string) ($raw['otp_login_template'] ?? self::defaults()['otp_login_template']),
            'otp_register_template' => (string) ($raw['otp_register_template'] ?? self::defaults()['otp_register_template']),
            'use_pattern_for_otp' => ! empty($raw['use_pattern_for_otp']),
            'sender_line_service' => (string) ($raw['sender_line_service'] ?? ''),
            'otp_channels' => [
                'sms' => ! isset($channels['sms']) || ! empty($channels['sms']),
                'email' => ! isset($channels['email']) || ! empty($channels['email']),
                'bale' => ! isset($channels['bale']) || ! empty($channels['bale']),
                'telegram' => ! isset($channels['telegram']) || ! empty($channels['telegram']),
            ],
        ];
    }
}
