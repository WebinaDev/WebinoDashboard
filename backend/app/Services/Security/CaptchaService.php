<?php

namespace App\Services\Security;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Tenant captcha: reCAPTCHA, hCaptcha, Turnstile, or offline numeric (Iran-friendly).
 */
final class CaptchaService
{
    public const PROVIDERS = ['none', 'recaptcha_v2', 'recaptcha_v3', 'hcaptcha', 'turnstile', 'numeric'];

    /** @return array{required: bool, provider: string, site_key: string, v3_threshold: float} */
    public static function publicConfig(int $tenantId, string $surface = 'forms'): array
    {
        $s = SecuritySettings::get($tenantId);
        $captcha = $s['captcha'] ?? [];
        $provider = (string) ($captcha['provider'] ?? 'none');
        $protect = $captcha['protect'] ?? [];
        $required = $provider !== 'none' && ! empty($protect[$surface]);

        return [
            'required' => $required,
            'provider' => $required ? $provider : 'none',
            'site_key' => $required ? (string) ($captcha['site_key'] ?? '') : '',
            'v3_threshold' => (float) ($captcha['v3_threshold'] ?? 0.5),
        ];
    }

    /** Offline numeric challenge for forms/login when provider=numeric. */
    public static function issueNumeric(int $tenantId): array
    {
        $a = random_int(1, 9);
        $b = random_int(1, 9);
        $id = Str::uuid()->toString();
        Cache::put(self::numericKey($tenantId, $id), (string) ($a + $b), now()->addMinutes(10));

        return [
            'challenge_id' => $id,
            'question' => $a.' + '.$b,
            'provider' => 'numeric',
        ];
    }

    public static function verify(int $tenantId, string $surface, ?string $token, ?string $challengeId = null, ?string $remoteIp = null): bool
    {
        $cfg = self::publicConfig($tenantId, $surface);
        if (! $cfg['required']) {
            return true;
        }

        $provider = $cfg['provider'];
        $token = trim((string) $token);
        if ($provider === 'numeric') {
            return self::verifyNumeric($tenantId, (string) $challengeId, $token);
        }

        if ($token === '') {
            return false;
        }

        $secret = self::rawSecret($tenantId);
        if ($secret === '') {
            return false;
        }

        return match ($provider) {
            'recaptcha_v2', 'recaptcha_v3' => self::verifyGoogle($secret, $token, $remoteIp, $provider === 'recaptcha_v3' ? (float) $cfg['v3_threshold'] : null),
            'hcaptcha' => self::verifyHcaptcha($secret, $token, $remoteIp),
            'turnstile' => self::verifyTurnstile($secret, $token, $remoteIp),
            default => false,
        };
    }

    private static function verifyNumeric(int $tenantId, string $challengeId, string $answer): bool
    {
        if ($challengeId === '' || $answer === '') {
            return false;
        }
        $key = self::numericKey($tenantId, $challengeId);
        $expected = Cache::pull($key);
        if ($expected === null) {
            return false;
        }

        return trim($answer) === (string) $expected;
    }

    private static function verifyGoogle(string $secret, string $token, ?string $ip, ?float $threshold): bool
    {
        $res = Http::asForm()->timeout(8)->post('https://www.google.com/recaptcha/api/siteverify', array_filter([
            'secret' => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]));
        if (! $res->ok() || ! $res->json('success')) {
            return false;
        }
        if ($threshold !== null) {
            return (float) $res->json('score', 0) >= $threshold;
        }

        return true;
    }

    private static function verifyHcaptcha(string $secret, string $token, ?string $ip): bool
    {
        $res = Http::asForm()->timeout(8)->post('https://hcaptcha.com/siteverify', array_filter([
            'secret' => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]));

        return $res->ok() && (bool) $res->json('success');
    }

    private static function verifyTurnstile(string $secret, string $token, ?string $ip): bool
    {
        $res = Http::asForm()->timeout(8)->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', array_filter([
            'secret' => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]));

        return $res->ok() && (bool) $res->json('success');
    }

    public static function rawSecret(int $tenantId): string
    {
        $stored = app(\App\Services\Modules\ModuleSettingsService::class)
            ->get($tenantId, SecuritySettings::MODULE, SecuritySettings::KEY, []);
        $secret = (string) data_get($stored, 'captcha.secret_key', '');
        if (str_starts_with($secret, 'enc:')) {
            try {
                return Crypt::decryptString(substr($secret, 4));
            } catch (\Throwable) {
                return '';
            }
        }

        return $secret;
    }

    private static function numericKey(int $tenantId, string $id): string
    {
        return 'security:captcha:numeric:'.$tenantId.':'.$id;
    }
}
