<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\PersonalAccessToken;
use Throwable;

final class ImpersonationSession
{
    /**
     * @param  array<string, mixed>  $context
     */
    public static function store(int $tokenId, array $context): void
    {
        Cache::put(self::key($tokenId), $context, self::ttl($context));
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function forTokenId(int $tokenId): ?array
    {
        $stored = Cache::get(self::key($tokenId));

        return is_array($stored) ? $stored : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function current(Request $request): ?array
    {
        $id = self::tokenId($request);

        return $id ? self::forTokenId($id) : null;
    }

    public static function active(Request $request): bool
    {
        return self::current($request) !== null;
    }

    public static function blockSecurityChanges(Request $request): void
    {
        if (self::active($request)) {
            abort(403, 'Security settings cannot be changed during impersonation.');
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function publishFor(Request $request): ?array
    {
        $stored = self::current($request);

        return is_array($stored) ? ImpersonationPayload::publish($stored) : null;
    }

    public static function forget(Request $request): void
    {
        $id = self::tokenId($request);
        if ($id) {
            Cache::forget(self::key($id));
        }
    }

    public static function forgetTokenId(int $tokenId): void
    {
        Cache::forget(self::key($tokenId));
    }

    /**
     * Tell ERP this passport is finished. Failure leaves only the short TTL.
     *
     * @param  array<string, mixed>  $stored
     */
    public static function revokeRemote(array $stored): void
    {
        $passport = is_string($stored['passport'] ?? null) ? $stored['passport'] : '';
        if ($passport === '') {
            return;
        }
        $base = rtrim((string) config('services.webino.base_url'), '/');
        $host = strtolower((string) parse_url($base, PHP_URL_HOST));
        if ($base === '' || $host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return;
        }
        $provisionId = (int) ($stored['provision_id'] ?? 0);

        try {
            Http::acceptJson()->timeout(15)->post($base.'/api/v1/site-builder/impersonate/exit', [
                'passport' => $passport,
                'provision_id' => $provisionId > 0 ? $provisionId : null,
            ]);
        } catch (Throwable) {
            // The passport still expires on its own.
        }
    }

    /**
     * Keep the staff banner across a Sanctum refresh.
     *
     * @return array<string, mixed>|null
     */
    public static function pull(Request $request): ?array
    {
        $id = self::tokenId($request);
        if (! $id) {
            return null;
        }
        $stored = Cache::pull(self::key($id));

        return is_array($stored) ? $stored : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private static function ttl(array $context): int
    {
        $exp = strtotime((string) ($context['expires_at'] ?? ''));
        if (! $exp) {
            return 1200;
        }

        return max(60, $exp - time());
    }

    private static function key(int $tokenId): string
    {
        return 'impersonation:pat:'.$tokenId;
    }

    private static function tokenId(Request $request): ?int
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken && isset($token->id)) {
            return (int) $token->id;
        }

        return null;
    }
}
