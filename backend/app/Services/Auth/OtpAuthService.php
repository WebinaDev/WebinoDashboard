<?php

namespace App\Services\Auth;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Users\UserWelcomeService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final class OtpAuthService
{
    private const OTP_PREFIX = 'auth_otp:';

    private const ATTEMPTS_PREFIX = 'auth_otp_att:';

    private const RATE_PREFIX = 'auth_otp_rl:';

    public function __construct(
        private readonly ModuleSettingsService $settings,
        private readonly OtpDeliveryService $delivery,
    ) {}

    /**
     * @return array{ok: bool, channels_sent: list<string>, masked_destinations: array<string, string>, message: string}
     */
    public function send(Tenant $tenant, string $identifier, string $purpose = 'login'): array
    {
        $purpose = $purpose === 'register' ? 'register' : 'login';
        $config = OtpSettings::forTenant((int) $tenant->id, $this->settings);

        if ($purpose === 'login' && ! $config['otp_login_enabled']) {
            throw $this->error(__('auth.otp_login_disabled'), 403);
        }
        if ($purpose === 'register' && ! $config['otp_register_enabled']) {
            throw $this->error(__('auth.otp_register_disabled'), 403);
        }

        $parsed = OtpIdentifier::parse($identifier);
        if (! $this->sendRateOk((int) $tenant->id, $parsed['key'])) {
            throw $this->error(__('auth.otp_rate_limited'), 429);
        }

        $user = $this->resolveUser($tenant, $parsed);

        if ($purpose === 'login' && ! $user) {
            return [
                'ok' => true,
                'channels_sent' => [],
                'masked_destinations' => [],
                'message' => __('auth.otp_sent_if_exists'),
            ];
        }

        if ($purpose === 'register' && $user) {
            $purpose = 'login';
            if (! $config['otp_login_enabled']) {
                throw $this->error(__('auth.otp_user_exists'), 409);
            }
        }

        $code = $this->generateCode((int) $config['otp_length']);
        $ttlSeconds = max(60, (int) $config['otp_expiry_minutes'] * 60);

        $payload = [
            'code_hash' => Hash::make($code),
            'purpose' => $purpose,
            'user_id' => $user?->id ?? 0,
            'phone' => $parsed['phone'],
            'email' => $parsed['email'] !== ''
                ? $parsed['email']
                : ($user && filter_var($user->email, FILTER_VALIDATE_EMAIL) ? strtolower((string) $user->email) : ''),
            'identifier' => $parsed['raw'],
            'created' => time(),
        ];

        $otpKey = $this->otpCacheKey((int) $tenant->id, $parsed['key']);
        Cache::put($otpKey, $payload, $ttlSeconds);
        Cache::forget($this->attemptsCacheKey((int) $tenant->id, $parsed['key']));

        $template = $purpose === 'register'
            ? (string) $config['otp_register_template']
            : (string) $config['otp_login_template'];
        $message = $this->renderTemplate($template, $code, $tenant);

        $delivered = $this->delivery->deliver($tenant, $user, $config, $payload, $message);

        if ($delivered['channels_sent'] === []) {
            Cache::forget($otpKey);
            throw $this->error(__('auth.otp_undeliverable'), 502);
        }

        return [
            'ok' => true,
            'channels_sent' => $delivered['channels_sent'],
            'masked_destinations' => $delivered['masked_destinations'],
            'message' => __('auth.otp_sent'),
        ];
    }

    /**
     * @return array{user: User, created: bool}
     */
    public function verify(Tenant $tenant, string $identifier, string $code, string $purpose = 'login'): array
    {
        $purpose = $purpose === 'register' ? 'register' : 'login';
        $config = OtpSettings::forTenant((int) $tenant->id, $this->settings);

        if ($purpose === 'login' && ! $config['otp_login_enabled']) {
            throw $this->error(__('auth.otp_login_disabled'), 403);
        }
        if ($purpose === 'register' && ! $config['otp_register_enabled'] && ! $config['otp_login_enabled']) {
            throw $this->error(__('auth.otp_register_disabled'), 403);
        }

        $parsed = OtpIdentifier::parse($identifier);
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if ($code === '') {
            throw $this->validation(__('auth.otp_code_required'), 'code');
        }

        $tenantId = (int) $tenant->id;
        $attemptsKey = $this->attemptsCacheKey($tenantId, $parsed['key']);
        $attempts = (int) Cache::get($attemptsKey, 0);
        $maxAttempts = (int) $config['otp_max_attempts'];

        if ($attempts >= $maxAttempts) {
            Cache::forget($this->otpCacheKey($tenantId, $parsed['key']));
            throw $this->error(__('auth.otp_attempts_exceeded'), 429);
        }

        $stored = Cache::get($this->otpCacheKey($tenantId, $parsed['key']));
        if (! is_array($stored) || empty($stored['code_hash'])) {
            throw $this->validation(__('auth.otp_expired'), 'code');
        }

        if (! Hash::check($code, (string) $stored['code_hash'])) {
            Cache::put($attemptsKey, $attempts + 1, 3600);
            throw $this->validation(__('auth.otp_code_invalid'), 'code');
        }

        Cache::forget($this->otpCacheKey($tenantId, $parsed['key']));
        Cache::forget($attemptsKey);

        $storedPurpose = (string) ($stored['purpose'] ?? $purpose);
        if (! in_array($storedPurpose, ['login', 'register'], true)) {
            $storedPurpose = 'login';
        }

        $created = false;
        $userId = (int) ($stored['user_id'] ?? 0);
        $user = $userId > 0 ? User::query()->where('tenant_id', $tenant->id)->find($userId) : null;

        if (! $user && $storedPurpose === 'register') {
            $user = $this->createUserFromPayload($tenant, $stored, $parsed);
            $created = true;
        }

        if (! $user) {
            $user = $this->resolveUser($tenant, $parsed);
        }

        if (! $user || $user->is_active === false) {
            throw $this->error(__('auth.otp_user_missing'), 404);
        }

        return ['user' => $user, 'created' => $created];
    }

    public function otpCacheKey(int $tenantId, string $identityKey): string
    {
        return self::OTP_PREFIX.$tenantId.':'.$identityKey;
    }

    public function attemptsCacheKey(int $tenantId, string $identityKey): string
    {
        return self::ATTEMPTS_PREFIX.$tenantId.':'.$identityKey;
    }

    /** @param  array{raw: string, key: string, phone: string, email: string}  $parsed */
    private function resolveUser(Tenant $tenant, array $parsed): ?User
    {
        $query = User::query()->where('tenant_id', $tenant->id);

        if ($parsed['email'] !== '') {
            return (clone $query)->where('email', $parsed['email'])->first();
        }

        if ($parsed['phone'] === '') {
            return null;
        }

        return (clone $query)->where('phone', $parsed['phone'])->first();
    }

    private function generateCode(int $length): string
    {
        $length = max(4, min(8, $length));
        $min = (int) str_pad('1', $length, '0');
        $max = (int) str_pad('9', $length, '9');

        return (string) random_int($min, $max);
    }

    private function sendRateOk(int $tenantId, string $identityKey): bool
    {
        $key = self::RATE_PREFIX.$tenantId.':'.$identityKey;
        $count = (int) Cache::get($key, 0);
        if ($count >= 5) {
            return false;
        }
        Cache::put($key, $count + 1, 15 * 60);

        return true;
    }

    private function renderTemplate(string $template, string $code, Tenant $tenant): string
    {
        if (trim($template) === '') {
            $template = __('auth.otp_default_template');
        }
        $siteName = (string) ($tenant->store_display_name ?: $tenant->name);

        return str_replace(
            ['{code}', '{site_name}'],
            [$code, $siteName],
            $template
        );
    }

    /** @param  array<string, mixed>  $stored */
    /** @param  array{raw: string, key: string, phone: string, email: string}  $parsed */
    private function createUserFromPayload(Tenant $tenant, array $stored, array $parsed): User
    {
        if (! OtpSettings::forTenant((int) $tenant->id, $this->settings)['otp_register_enabled']) {
            throw $this->error(__('auth.otp_register_disabled'), 403);
        }

        $phone = (string) ($stored['phone'] ?? $parsed['phone']);
        $email = (string) ($stored['email'] ?? $parsed['email']);

        if ($phone === '' && $email === '') {
            throw $this->validation(__('auth.otp_register_needs_contact'), 'identifier');
        }

        if ($email === '' && $phone !== '') {
            $email = $phone.'@otp.local';
        }

        if (User::query()->where('email', $email)->exists()) {
            throw $this->error(__('auth.otp_user_exists'), 409);
        }

        $name = $phone !== '' ? $phone : Str::before($email, '@');

        $user = User::query()->create([
            'tenant_id' => $tenant->id,
            'name' => $name,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'password' => Str::password(24),
            'role' => 'customer',
            'is_active' => true,
            'password_must_change' => false,
        ]);
        app(UserWelcomeService::class)->welcome($user);

        return $user;
    }

    private function error(string $message, int $status): HttpResponseException
    {
        return new HttpResponseException(response()->json(['message' => $message], $status));
    }

    private function validation(string $message, string $field): HttpResponseException
    {
        return new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => [$field => [$message]],
        ], 422));
    }
}
