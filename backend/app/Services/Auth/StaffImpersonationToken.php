<?php

namespace App\Services\Auth;

/**
 * HS256 magic-login token issued by WebinoERP.
 * Compact form: base64url(header).base64url(payload).base64url(hmac).
 * The algorithm is fixed to HMAC-SHA256; the header alg is never trusted.
 */
final class StaffImpersonationToken
{
    public const NAME = 'staff-impersonation';

    public const COOKIE = 'webino_staff_impersonate';

    public const QUERY = 'impersonate_token';

    public const MAX_LENGTH = 24576;

    public const AUDIENCE = 'webinodashboard';

    public const ISSUER = 'webino-erp';

    private const SKEW_SECONDS = 30;

    /**
     * @param  array<string, mixed>  $claims
     */
    public static function sign(array $claims, string $secret): string
    {
        $header = self::b64url((string) json_encode([
            'alg' => 'HS256',
            'typ' => 'JWT',
        ], JSON_UNESCAPED_SLASHES));
        $payload = self::b64url((string) json_encode(
            $claims,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ));
        $sig = self::b64url(hash_hmac('sha256', $header.'.'.$payload, $secret, true));

        return $header.'.'.$payload.'.'.$sig;
    }

    /**
     * @return array<string, mixed>
     */
    public static function verify(string $token, string $secret, int $maxTtlSeconds): array
    {
        if ($secret === '' || strlen($token) > self::MAX_LENGTH) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3 || in_array('', $parts, true)) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        [$headerPart, $payloadPart, $sigPart] = $parts;
        $headerJson = self::b64decode($headerPart);
        $payloadJson = self::b64decode($payloadPart);
        $given = self::b64decode($sigPart);
        if ($headerJson === null || $payloadJson === null || $given === null) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $header = json_decode($headerJson, true);
        if (! is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $expected = hash_hmac('sha256', $headerPart.'.'.$payloadPart, $secret, true);
        if (strlen($given) !== strlen($expected) || ! hash_equals($expected, $given)) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $claims = json_decode($payloadJson, true);
        if (! is_array($claims) || array_is_list($claims)) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        if (isset($claims['aud']) && ! self::audienceOk($claims['aud'])) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }
        if (isset($claims['iss']) && $claims['iss'] !== self::ISSUER) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        if (! is_numeric($claims['exp'] ?? null) || ! is_numeric($claims['iat'] ?? null)) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }

        $exp = (int) $claims['exp'];
        $iat = (int) $claims['iat'];
        $now = time();
        if ($exp <= $iat || ($exp - $iat) > $maxTtlSeconds || $iat > $now + self::SKEW_SECONDS) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }
        if (isset($claims['nbf']) && is_numeric($claims['nbf']) && (int) $claims['nbf'] > $now + self::SKEW_SECONDS) {
            throw StaffImpersonationException::make('IMPERSONATION_INVALID');
        }
        if ($exp < $now - self::SKEW_SECONDS) {
            throw StaffImpersonationException::make('IMPERSONATION_EXPIRED');
        }

        return $claims;
    }

    public static function normalizeHost(string $value): string
    {
        $value = strtolower(trim($value));
        $value = preg_replace('#^[a-z][a-z0-9+.-]*://#', '', $value) ?? $value;
        $value = explode('/', $value, 2)[0];
        $value = explode('@', $value, 2);
        $value = (string) end($value);
        if (str_starts_with($value, '[')) {
            $end = strpos($value, ']');
            $value = $end === false ? $value : substr($value, 1, $end - 1);
        } else {
            $value = explode(':', $value, 2)[0];
        }

        return rtrim($value, '.');
    }

    public static function sanitizeSwitchUrl(?string $url, string $domain): ?string
    {
        if ($url === null || $url === '' || strlen($url) > 2000) {
            return null;
        }
        $parts = parse_url($url);
        if (! is_array($parts) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
            return null;
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = self::normalizeHost((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');
        $https = $scheme === 'https';
        $localHttp = $scheme === 'http' && in_array($host, ['localhost', '127.0.0.1'], true);
        if ((! $https && ! $localHttp) || $host === '' || $host !== self::normalizeHost($domain)) {
            return null;
        }
        if ($path !== '/login' && $path !== '/login/') {
            return null;
        }

        return $url;
    }

    public static function sanitizeReturnUrl(mixed $url): ?string
    {
        return self::sanitizeAbsoluteUrl($url, 500);
    }

    public static function sanitizeSitesUrl(mixed $url): ?string
    {
        return self::sanitizeAbsoluteUrl($url, 500);
    }

    private static function sanitizeAbsoluteUrl(mixed $url, int $max): ?string
    {
        if (! is_string($url) || $url === '' || strlen($url) > $max) {
            return null;
        }
        $parts = parse_url($url);
        if (! is_array($parts) || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return null;
        }

        return $url;
    }

    private static function audienceOk(mixed $aud): bool
    {
        if ($aud === self::AUDIENCE) {
            return true;
        }
        if (! is_array($aud)) {
            return false;
        }

        return in_array(self::AUDIENCE, $aud, true);
    }

    private static function b64url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function b64decode(string $data): ?string
    {
        if ($data === '' || ! preg_match('/^[A-Za-z0-9_-]+$/', $data)) {
            return null;
        }
        $remainder = strlen($data) % 4;
        if ($remainder > 0) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
