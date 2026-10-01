<?php

namespace App\Services\Security;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Per-tenant login attempt limiter backed by cache.
 */
final class LoginAttemptService
{
    public function isLocked(int $tenantId, string $email, string $ip): bool
    {
        if ($tenantId <= 0) {
            return false;
        }
        $settings = SecuritySettings::get($tenantId);
        if (empty($settings['general']['enabled']) || empty($settings['login']['limit_attempts'])) {
            return false;
        }

        return Cache::has($this->lockKey($tenantId, $email, $ip));
    }

    public function remainingLockSeconds(int $tenantId, string $email, string $ip): int
    {
        $until = Cache::get($this->lockKey($tenantId, $email, $ip));
        if (! is_numeric($until)) {
            return 0;
        }

        return max(0, (int) $until - time());
    }

    public function recordFailure(int $tenantId, string $email, string $ip): void
    {
        if ($tenantId <= 0) {
            return;
        }
        $settings = SecuritySettings::get($tenantId);
        if (empty($settings['general']['enabled']) || empty($settings['login']['limit_attempts'])) {
            return;
        }

        $max = max(1, (int) ($settings['login']['max_attempts'] ?? 5));
        $lockMinutes = max(1, (int) ($settings['login']['lockout_minutes'] ?? 15));
        $key = $this->attemptKey($tenantId, $email, $ip);
        $attempts = (int) Cache::get($key, 0) + 1;
        Cache::put($key, $attempts, now()->addMinutes($lockMinutes));

        if ($attempts >= $max) {
            $until = time() + ($lockMinutes * 60);
            Cache::put($this->lockKey($tenantId, $email, $ip), $until, now()->addMinutes($lockMinutes));
            Cache::forget($key);
            Log::warning('security.login_lockout', [
                'tenant_id' => $tenantId,
                'email' => $email,
                'ip' => $ip,
                'minutes' => $lockMinutes,
                'notify_email' => ! empty($settings['notify']['email']),
                'notify_site' => ! empty($settings['notify']['site']),
            ]);
        }
    }

    public function clear(int $tenantId, string $email, string $ip): void
    {
        Cache::forget($this->attemptKey($tenantId, $email, $ip));
        Cache::forget($this->lockKey($tenantId, $email, $ip));
    }

    private function attemptKey(int $tenantId, string $email, string $ip): string
    {
        return 'security:login:attempts:'.$tenantId.':'.sha1(strtolower($email).'|'.$ip);
    }

    private function lockKey(int $tenantId, string $email, string $ip): string
    {
        return 'security:login:lock:'.$tenantId.':'.sha1(strtolower($email).'|'.$ip);
    }
}
