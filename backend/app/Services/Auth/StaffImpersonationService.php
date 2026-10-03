<?php

namespace App\Services\Auth;

use App\Http\Middleware\EnsureStaffRole;
use App\Models\StaffImpersonationSession;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;

class StaffImpersonationService
{
    /**
     * Exchange a one-time ERP token for a short Sanctum session.
     *
     * @return array{user: User, plain: string, minutes: int, impersonation: array<string, mixed>}
     */
    public function exchange(Request $request, ?string $bodyToken): array
    {
        $secret = $this->secret();
        if ($secret === '') {
            throw StaffImpersonationException::make('IMPERSONATION_UNAVAILABLE', 503);
        }

        $presented = $this->presentedToken($request, $bodyToken);
        if ($presented === null) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $claims = StaffImpersonationToken::verify($presented, $secret, $this->maxTtl());
        $jti = $claims['jti'] ?? null;
        if (! is_string($jti) || ! preg_match('/^[A-Za-z0-9_-]{8,128}$/', $jti)) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $normalized = $this->normalizeClaims($claims);
        $digest = hash('sha256', $jti);
        $lock = $this->acquireLock($digest);

        try {
            $replay = Cache::get($this->replayKey($digest));
            if (is_array($replay) && isset($replay['plain'], $replay['user_id'], $replay['minutes'])) {
                return $this->replayResponse($replay);
            }
            if (Cache::has($this->usedKey($digest))) {
                throw StaffImpersonationException::make('IMPERSONATION_REPLAY');
            }

            $tenant = $this->resolveTenant($normalized['domain'], $request);
            $user = $this->resolveStaffUser($tenant);
            StaffImpersonationSession::query()->where('expires_at', '<', now())->delete();

            $minutes = $this->sessionMinutes();
            $issued = $user->createToken(
                StaffImpersonationToken::NAME,
                ['*'],
                now()->addMinutes($minutes),
            );
            $session = StaffImpersonationSession::query()->create([
                'personal_access_token_id' => $issued->accessToken->id,
                'staff_id' => $normalized['staff_id'],
                'staff_name' => $normalized['staff_name'],
                'site_id' => $normalized['site_id'],
                'site_name' => $normalized['site_name'],
                'domain' => $normalized['domain'],
                'customer' => $normalized['customer'],
                'sites' => $normalized['sites'],
                'return_url' => $normalized['return_url'],
                'sites_url' => $normalized['sites_url'],
                'expires_at' => now()->addMinutes($minutes),
            ]);

            $exp = (int) $claims['exp'];
            Cache::put($this->usedKey($digest), 1, now()->addSeconds(max(60, $exp - time())));
            Cache::put($this->replayKey($digest), [
                'plain' => $issued->plainTextToken,
                'user_id' => $user->id,
                'minutes' => $minutes,
            ], now()->addSeconds(90));

            Log::info('staff_impersonation.started', [
                'staff_id' => $normalized['staff_id'],
                'site_id' => $normalized['site_id'],
                'domain' => $normalized['domain'],
                'tenant_id' => $tenant->id,
            ]);

            return $this->successPayload($user, $issued->plainTextToken, $minutes, $session);
        } finally {
            $lock?->release();
        }
    }

    public function isImpersonating(Request $request): bool
    {
        $token = $this->accessToken($request);

        return $token instanceof PersonalAccessToken
            && $token->name === StaffImpersonationToken::NAME;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function publicPayload(Request $request): ?array
    {
        $session = $this->sessionForRequest($request);

        return $session ? $this->present($session) : null;
    }

    public function refreshSites(Request $request): void
    {
        $session = $this->sessionForRequest($request);
        if (! $session || ! is_string($session->sites_url) || $session->sites_url === '') {
            return;
        }

        $url = $this->allowlistedErpUrl($session->sites_url);
        $erpToken = (string) config('services.webino.erp_api_token', '');
        if ($url === null || $erpToken === '') {
            return;
        }

        try {
            $response = Http::withToken($erpToken)
                ->acceptJson()
                ->timeout(4)
                ->withOptions(['allow_redirects' => false])
                ->get($url);
        } catch (\Throwable $e) {
            Log::warning('staff_impersonation.sites_refresh_failed', ['error' => $e->getMessage()]);

            return;
        }

        if (! $response->successful()) {
            return;
        }

        $json = $response->json();
        $sites = is_array($json) ? ($json['data']['sites'] ?? $json['sites'] ?? null) : null;
        if (! is_array($sites)) {
            return;
        }

        $normalized = $this->normalizeSites($sites);
        if ($normalized === []) {
            return;
        }

        $session->sites = $normalized;
        $session->save();
    }

    public function switchSite(Request $request, string $siteId): string
    {
        $session = $this->requireSession($request);
        $siteId = $this->scalarId($siteId);
        $site = null;
        foreach ($session->sites ?? [] as $row) {
            if (is_array($row) && (string) ($row['site_id'] ?? '') === $siteId) {
                $site = $row;
                break;
            }
        }
        if ($site === null || $siteId === '') {
            throw StaffImpersonationException::make('IMPERSONATION_SWITCH_UNAVAILABLE', 422);
        }
        if ($siteId === (string) $session->site_id) {
            throw StaffImpersonationException::make('IMPERSONATION_CURRENT_SITE', 422);
        }

        $embedded = is_string($site['switch_url'] ?? null) ? $site['switch_url'] : null;
        $safe = StaffImpersonationToken::sanitizeSwitchUrl($embedded, (string) ($site['domain'] ?? ''));
        if ($safe !== null) {
            return $safe;
        }

        $minted = $this->mintSwitchUrl($session, $site);
        if ($minted === null) {
            throw StaffImpersonationException::make('IMPERSONATION_SWITCH_UNAVAILABLE', 422);
        }

        return $minted;
    }

    public function terminate(Request $request): ?string
    {
        $session = $this->sessionForRequest($request);
        if (! $session) {
            throw StaffImpersonationException::make('IMPERSONATION_NOT_ACTIVE', 403);
        }

        $return = is_string($session->return_url) && $session->return_url !== ''
            ? $session->return_url
            : null;
        $staffId = $session->staff_id;
        $session->delete();
        $this->deleteRequestTokens($request);

        Log::info('staff_impersonation.ended', ['staff_id' => $staffId]);

        return $return;
    }

    public function discard(Request $request): void
    {
        $token = $this->accessToken($request);
        if ($token instanceof PersonalAccessToken) {
            StaffImpersonationSession::query()
                ->where('personal_access_token_id', $token->id)
                ->delete();
        }
    }

    public function rebind(int $oldTokenId, int $newTokenId): void
    {
        StaffImpersonationSession::query()
            ->where('personal_access_token_id', $oldTokenId)
            ->update([
                'personal_access_token_id' => $newTokenId,
                'expires_at' => now()->addMinutes($this->sessionMinutes()),
            ]);
    }

    public function sessionMinutes(): int
    {
        $minutes = (int) config('services.webino.staff_impersonation_session_minutes', 480);

        return max(15, min($minutes, 12 * 60));
    }

    public function clearTransportCookie(JsonResponse $response, Request $request): JsonResponse
    {
        return $response->cookie(
            StaffImpersonationToken::COOKIE,
            '',
            -1,
            '/',
            null,
            $request->secure(),
            true,
            false,
            'lax',
        );
    }

    /**
     * @param  array<string, mixed>  $replay
     * @return array{user: User, plain: string, minutes: int, impersonation: array<string, mixed>}
     */
    private function replayResponse(array $replay): array
    {
        $user = User::query()->with('tenant')->find((int) $replay['user_id']);
        if (! $user || $user->is_active === false) {
            throw StaffImpersonationException::make('IMPERSONATION_REPLAY');
        }
        $access = PersonalAccessToken::findToken((string) $replay['plain']);
        if (! $access instanceof PersonalAccessToken || $access->name !== StaffImpersonationToken::NAME) {
            throw StaffImpersonationException::make('IMPERSONATION_REPLAY');
        }
        $session = StaffImpersonationSession::query()
            ->where('personal_access_token_id', $access->id)
            ->first();
        if (! $session || ($session->expires_at && $session->expires_at->isPast())) {
            throw StaffImpersonationException::make('IMPERSONATION_REPLAY');
        }

        return $this->successPayload($user, (string) $replay['plain'], (int) $replay['minutes'], $session);
    }

    /**
     * @return array{user: User, plain: string, minutes: int, impersonation: array<string, mixed>}
     */
    private function successPayload(User $user, string $plain, int $minutes, StaffImpersonationSession $session): array
    {
        $user->loadMissing('tenant');

        return [
            'user' => $user,
            'plain' => $plain,
            'minutes' => $minutes,
            'impersonation' => $this->present($session),
        ];
    }

    private function requireSession(Request $request): StaffImpersonationSession
    {
        $session = $this->sessionForRequest($request);
        if (! $session) {
            throw StaffImpersonationException::make('IMPERSONATION_NOT_ACTIVE', 403);
        }

        return $session;
    }

    private function sessionForRequest(Request $request): ?StaffImpersonationSession
    {
        $token = $this->accessToken($request);
        if (! $token instanceof PersonalAccessToken || $token->name !== StaffImpersonationToken::NAME) {
            return null;
        }

        $session = StaffImpersonationSession::query()
            ->where('personal_access_token_id', $token->id)
            ->first();
        if (! $session || ($session->expires_at && $session->expires_at->isPast())) {
            return null;
        }

        return $session;
    }

    private function accessToken(Request $request): ?PersonalAccessToken
    {
        $current = $request->user()?->currentAccessToken();
        if ($current instanceof PersonalAccessToken) {
            return $current;
        }

        $plain = $request->bearerToken();
        if (! is_string($plain) || $plain === '') {
            $cookie = $request->cookie((string) config('auth.cookie_name', 'webino_auth_token'));
            $plain = is_string($cookie) ? $cookie : '';
        }
        if ($plain === '') {
            return null;
        }

        $token = PersonalAccessToken::findToken($plain);

        return $token instanceof PersonalAccessToken ? $token : null;
    }

    private function deleteRequestTokens(Request $request): void
    {
        $cookieName = (string) config('auth.cookie_name', 'webino_auth_token');
        $cookieToken = $request->cookie($cookieName);
        if (is_string($cookieToken) && $cookieToken !== '') {
            PersonalAccessToken::findToken($cookieToken)?->delete();
        }

        $bearer = $request->bearerToken();
        if (is_string($bearer) && $bearer !== '') {
            PersonalAccessToken::findToken($bearer)?->delete();
        }

        $current = $request->user()?->currentAccessToken();
        if ($current instanceof PersonalAccessToken) {
            $current->delete();
        }
    }

    private function presentedToken(Request $request, ?string $bodyToken): ?string
    {
        $bodyToken = is_string($bodyToken) ? trim($bodyToken) : '';
        if ($bodyToken !== '') {
            return $bodyToken;
        }

        $cookie = $request->cookie(StaffImpersonationToken::COOKIE);
        if (! is_string($cookie)) {
            return null;
        }
        $cookie = trim($cookie);

        return $cookie !== '' ? $cookie : null;
    }

    private function resolveTenant(string $domain, Request $request): Tenant
    {
        $want = StaffImpersonationToken::normalizeHost($domain);
        $tenants = Tenant::query()->get();
        $match = $tenants->first(function (Tenant $tenant) use ($want) {
            return StaffImpersonationToken::normalizeHost((string) $tenant->domain) === $want;
        });
        if ($match instanceof Tenant) {
            return $match;
        }

        $host = StaffImpersonationToken::normalizeHost($request->getHost());
        if ($tenants->count() === 1 && $host !== '' && $host === $want) {
            $only = $tenants->first();
            if ($only instanceof Tenant) {
                $onlyHost = StaffImpersonationToken::normalizeHost((string) $only->domain);
                if ($onlyHost === '' || $onlyHost === $host || in_array($onlyHost, ['localhost', '127.0.0.1'], true)) {
                    return $only;
                }
            }
        }

        throw StaffImpersonationException::make('IMPERSONATION_SITE_MISMATCH', 403);
    }

    private function resolveStaffUser(Tenant $tenant): User
    {
        $base = User::query()
            ->where('tenant_id', $tenant->id)
            ->where(function ($q) {
                $q->where('is_active', true)->orWhereNull('is_active');
            });

        $user = (clone $base)->where('role', 'admin')->orderBy('id')->first()
            ?? (clone $base)->whereIn('role', EnsureStaffRole::ROLES)->orderBy('id')->first();

        if (! $user instanceof User) {
            throw StaffImpersonationException::make('IMPERSONATION_UNAVAILABLE', 422);
        }

        return $user;
    }

    /**
     * @param  array<string, mixed>  $site
     */
    private function mintSwitchUrl(StaffImpersonationSession $session, array $site): ?string
    {
        $base = rtrim((string) config('services.webino.erp_base_url', ''), '/');
        $erpToken = (string) config('services.webino.erp_api_token', '');
        if ($base === '' || $erpToken === '') {
            return null;
        }

        $url = $this->allowlistedErpUrl($base.'/api/v1/staff-impersonation/switch');
        if ($url === null) {
            return null;
        }

        try {
            $response = Http::withToken($erpToken)
                ->acceptJson()
                ->timeout(4)
                ->withOptions(['allow_redirects' => false])
                ->post($url, [
                    'staff_id' => $session->staff_id,
                    'site_id' => (string) ($site['site_id'] ?? ''),
                    'domain' => (string) ($site['domain'] ?? ''),
                ]);
        } catch (\Throwable $e) {
            Log::warning('staff_impersonation.switch_failed', ['error' => $e->getMessage()]);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $switch = $response->json('data.switch_url') ?? $response->json('switch_url');
        if (! is_string($switch)) {
            return null;
        }

        return StaffImpersonationToken::sanitizeSwitchUrl($switch, (string) ($site['domain'] ?? ''));
    }

    private function allowlistedErpUrl(string $url): ?string
    {
        $base = rtrim((string) config('services.webino.erp_base_url', ''), '/');
        if ($base === '') {
            return null;
        }

        $parts = parse_url($url);
        $baseParts = parse_url($base);
        if (! is_array($parts) || ! is_array($baseParts)) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $baseScheme = strtolower((string) ($baseParts['scheme'] ?? ''));
        $host = StaffImpersonationToken::normalizeHost((string) ($parts['host'] ?? ''));
        $baseHost = StaffImpersonationToken::normalizeHost((string) ($baseParts['host'] ?? ''));
        if ($scheme === '' || $scheme !== $baseScheme || $host === '' || $host !== $baseHost) {
            return null;
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        if ($this->isBlockedHost($host)) {
            return null;
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = (string) ($parts['path'] ?? '/');
        $query = isset($parts['query']) ? '?'.$parts['query'] : '';

        return $scheme.'://'.$host.$port.$path.$query;
    }

    private function isBlockedHost(string $host): bool
    {
        if (in_array($host, ['localhost', '127.0.0.1', '::1', 'metadata.google.internal'], true)) {
            return ! app()->environment(['local', 'testing']);
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $public = filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            );

            return $public === false && ! app()->environment(['local', 'testing']);
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array{
     *     staff_id: string,
     *     staff_name: string,
     *     site_id: string,
     *     site_name: string,
     *     domain: string,
     *     customer: array<string, string>,
     *     sites: list<array<string, mixed>>,
     *     return_url: ?string,
     *     sites_url: ?string
     * }
     */
    private function normalizeClaims(array $claims): array
    {
        $staffId = $this->scalarId($claims['staff_id'] ?? null);
        $siteId = $this->scalarId($claims['site_id'] ?? null);
        $staffName = $this->cleanLabel($claims['staff_name'] ?? null, 191);
        $domain = StaffImpersonationToken::normalizeHost((string) ($claims['domain'] ?? ''));
        $customer = $this->normalizeCustomer($claims['customer'] ?? null);
        if ($staffId === '' || $siteId === '' || $staffName === '' || $domain === '' || $customer === null) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }
        if (! array_key_exists('sites', $claims) || ! is_array($claims['sites'])) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $sites = $this->normalizeSites($claims['sites']);
        $siteName = $this->cleanLabel($claims['site_name'] ?? null, 191);
        $known = false;
        foreach ($sites as $site) {
            if ($site['site_id'] !== $siteId) {
                continue;
            }
            $known = true;
            if ($siteName === '') {
                $siteName = (string) $site['name'];
            }
            break;
        }
        if ($siteName === '') {
            $siteName = $domain;
        }
        if (! $known) {
            array_unshift($sites, [
                'site_id' => $siteId,
                'name' => $siteName,
                'domain' => $domain,
                'customer' => $customer,
                'switch_url' => null,
            ]);
        }

        return [
            'staff_id' => $staffId,
            'staff_name' => $staffName,
            'site_id' => $siteId,
            'site_name' => $siteName,
            'domain' => $domain,
            'customer' => $customer,
            'sites' => $sites,
            'return_url' => StaffImpersonationToken::sanitizeReturnUrl($claims['return_url'] ?? null),
            'sites_url' => StaffImpersonationToken::sanitizeSitesUrl($claims['sites_url'] ?? null),
        ];
    }

    /**
     * @param  list<mixed>  $sites
     * @return list<array<string, mixed>>
     */
    private function normalizeSites(array $sites): array
    {
        $out = [];
        foreach (array_slice($sites, 0, 100) as $site) {
            if (! is_array($site)) {
                continue;
            }
            $siteId = $this->scalarId($site['site_id'] ?? null);
            $domain = StaffImpersonationToken::normalizeHost((string) ($site['domain'] ?? ''));
            if ($siteId === '' || $domain === '') {
                continue;
            }
            $name = $this->cleanLabel($site['name'] ?? $site['site_name'] ?? null, 191);
            if ($name === '') {
                $name = $domain;
            }
            $switch = StaffImpersonationToken::sanitizeSwitchUrl(
                is_string($site['switch_url'] ?? null) ? $site['switch_url'] : null,
                $domain,
            );
            $out[] = [
                'site_id' => $siteId,
                'name' => $name,
                'domain' => $domain,
                'customer' => $this->normalizeCustomer($site['customer'] ?? null),
                'switch_url' => $switch,
            ];
        }

        return $out;
    }

    /**
     * @return array<string, string>|null
     */
    private function normalizeCustomer(mixed $value): ?array
    {
        if (is_string($value) || is_numeric($value)) {
            $name = $this->cleanLabel($value, 191);

            return $name === '' ? null : ['id' => '', 'name' => $name];
        }
        if (! is_array($value)) {
            return null;
        }

        $id = $this->scalarId($value['id'] ?? '');
        $name = $this->cleanLabel($value['name'] ?? null, 191);
        if ($name === '' && $id === '') {
            return null;
        }
        if ($name === '') {
            $name = $id;
        }

        $customer = ['id' => $id, 'name' => $name];
        $email = $value['email'] ?? null;
        if (is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $customer['email'] = $email;
        }

        return $customer;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(StaffImpersonationSession $session): array
    {
        $sites = [];
        foreach ($session->sites ?? [] as $site) {
            if (! is_array($site)) {
                continue;
            }
            $customer = null;
            if (is_array($site['customer'] ?? null)) {
                $customer = [
                    'id' => (string) ($site['customer']['id'] ?? ''),
                    'name' => (string) ($site['customer']['name'] ?? ''),
                ];
            }
            $sites[] = [
                'site_id' => (string) ($site['site_id'] ?? ''),
                'name' => (string) ($site['name'] ?? ''),
                'domain' => (string) ($site['domain'] ?? ''),
                'customer' => $customer,
                'current' => (string) ($site['site_id'] ?? '') === (string) $session->site_id,
            ];
        }

        $customer = is_array($session->customer) ? $session->customer : [];
        $customerOut = [
            'id' => (string) ($customer['id'] ?? ''),
            'name' => (string) ($customer['name'] ?? ''),
        ];
        if (isset($customer['email']) && is_string($customer['email'])) {
            $customerOut['email'] = $customer['email'];
        }

        return [
            'active' => true,
            'staff_id' => (string) $session->staff_id,
            'staff_name' => (string) $session->staff_name,
            'site_id' => (string) $session->site_id,
            'site_name' => (string) $session->site_name,
            'domain' => (string) $session->domain,
            'customer' => $customerOut,
            'sites' => $sites,
        ];
    }

    private function scalarId(mixed $value): string
    {
        if (is_int($value) || (is_float($value) && floor($value) === $value)) {
            $value = (string) (int) $value;
        }
        if (! is_string($value)) {
            return '';
        }
        $value = trim($value);
        if ($value === '' || strlen($value) > 64 || ! preg_match('/^[A-Za-z0-9_.:-]+$/', $value)) {
            return '';
        }

        return $value;
    }

    private function cleanLabel(mixed $value, int $max): string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }
        $text = trim((string) (preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $value) ?? ''));
        if (mb_strlen($text) > $max) {
            $text = mb_substr($text, 0, $max);
        }

        return $text;
    }

    private function secret(): string
    {
        $dedicated = trim((string) config('services.webino.staff_impersonation_secret', ''));
        if ($dedicated !== '') {
            return $dedicated;
        }

        return trim((string) config('services.webino.provision_hmac_secret', ''));
    }

    private function maxTtl(): int
    {
        $ttl = (int) config('services.webino.staff_impersonation_ttl', 600);

        return max(60, min($ttl, 900));
    }

    private function usedKey(string $digest): string
    {
        return 'staff_impersonate_used:'.$digest;
    }

    private function replayKey(string $digest): string
    {
        return 'staff_impersonate_replay:'.$digest;
    }

    private function acquireLock(string $digest): ?object
    {
        try {
            $lock = Cache::lock('staff_impersonate_lock:'.$digest, 10);
            $lock->block(5);

            return $lock;
        } catch (\Throwable) {
            return null;
        }
    }
}
