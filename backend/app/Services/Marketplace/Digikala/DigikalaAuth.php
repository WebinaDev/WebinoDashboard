<?php

namespace App\Services\Marketplace\Digikala;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use DateTimeImmutable;
use DateTimeZone;
use Exception;

/**
 * Digikala seller Open API auth: RSA-4096 keypair, decrypting the encrypted authorization code,
 * token issue/refresh (port of WebinoDigikala\Auth). Tokens live in `marketplace.state.digikala`.
 */
class DigikalaAuth
{
    public const PLATFORM = 'digikala';

    public const TOKEN_PATH = 'open-api/v1/auth/token';

    public const REFRESH_PATH = 'open-api/v1/auth/refresh-token';

    public function __construct(
        protected int $tenantId,
        protected MarketplaceSettingsService $settings,
    ) {}

    public static function for(int $tenantId): self
    {
        return new self($tenantId, app(MarketplaceSettingsService::class));
    }

    /** @return array<string, mixed> */
    public function credentials(): array
    {
        return $this->settings->credentials($this->tenantId, self::PLATFORM);
    }

    public function baseUrl(): string
    {
        return rtrim((string) ($this->credentials()['base_url'] ?? '') ?: 'https://seller.digikala.com', '/');
    }

    /** @return array{access_token?: string, refresh_token?: string, access_expires_at?: int, refresh_expires_at?: int, scopes?: mixed} */
    public function tokens(): array
    {
        $state = $this->settings->state($this->tenantId, self::PLATFORM);

        return array_intersect_key($state, array_flip(['access_token', 'refresh_token', 'access_expires_at', 'refresh_expires_at', 'scopes']));
    }

    public function isConnected(): bool
    {
        $t = $this->tokens();

        return filled($t['access_token'] ?? null) || filled($t['refresh_token'] ?? null);
    }

    /** @return array{connected: bool, access_expires_at: ?string, refresh_expires_at: ?string, has_refresh: bool, scopes: mixed} */
    public function status(): array
    {
        $t = $this->tokens();
        $iso = fn ($ts) => ! empty($ts) ? date(DATE_ATOM, (int) $ts) : null;

        return [
            'connected' => $this->isConnected(),
            'access_expires_at' => $iso($t['access_expires_at'] ?? null),
            'refresh_expires_at' => $iso($t['refresh_expires_at'] ?? null),
            'has_refresh' => filled($t['refresh_token'] ?? null),
            'scopes' => $t['scopes'] ?? null,
        ];
    }

    /** Numeric (seconds or ms), {date, timezone} objects or date strings, Tehran time by default. */
    public static function parseExpiry(mixed $value): int
    {
        if (is_numeric($value)) {
            $n = (int) $value;
            if ($n > 20000000000) {
                $n = (int) floor($n / 1000);
            }

            return max(0, $n);
        }
        $date = '';
        $tz = 'Asia/Tehran';
        if (is_array($value)) {
            $date = (string) ($value['date'] ?? $value['datetime'] ?? '');
            $tz = (string) ($value['timezone'] ?? '') ?: 'Asia/Tehran';
        } elseif (is_string($value)) {
            $date = trim($value);
        }
        if ($date === '') {
            return 0;
        }
        try {
            return (new DateTimeImmutable($date, new DateTimeZone($tz)))->getTimestamp();
        } catch (Exception) {
            $ts = strtotime($date);

            return $ts ? (int) $ts : 0;
        }
    }

    /** @param  array<string, mixed>  $data */
    public function persistTokens(array $data): void
    {
        $current = $this->tokens();
        $now = time();

        $expires = 0;
        if (isset($data['expires_in'])) {
            $expires = $now + (int) $data['expires_in'];
        } elseif (! empty($data['access_token_expires_at'])) {
            $expires = self::parseExpiry($data['access_token_expires_at']);
        } elseif (! empty($data['access_expires_at'])) {
            $expires = self::parseExpiry($data['access_expires_at']);
        }
        if ($expires <= $now) {
            $expires = $now + 3600;
        }

        $refreshExpires = 0;
        if (isset($data['refresh_expires_in'])) {
            $refreshExpires = $now + (int) $data['refresh_expires_in'];
        } elseif (! empty($data['refresh_token_expires_at'])) {
            $refreshExpires = self::parseExpiry($data['refresh_token_expires_at']);
        } elseif (! empty($data['refresh_expires_at'])) {
            $refreshExpires = self::parseExpiry($data['refresh_expires_at']);
        } elseif (! empty($current['refresh_expires_at']) && (int) $current['refresh_expires_at'] > $now) {
            $refreshExpires = (int) $current['refresh_expires_at'];
        }
        if ($refreshExpires <= $now) {
            $refreshExpires = $now + 6 * 30 * 86400;
        }

        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'access_token' => (string) ($data['access_token'] ?? $current['access_token'] ?? ''),
            'refresh_token' => (string) ($data['refresh_token'] ?? $current['refresh_token'] ?? ''),
            'access_expires_at' => $expires,
            'refresh_expires_at' => $refreshExpires,
            'scopes' => $data['scopes'] ?? ($current['scopes'] ?? null),
        ]);
    }

    public function disconnect(): void
    {
        $this->settings->putState($this->tenantId, self::PLATFORM, [
            'access_token' => '',
            'refresh_token' => '',
            'access_expires_at' => 0,
            'refresh_expires_at' => 0,
            'scopes' => null,
        ]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Digikala tokens cleared');
    }

    public static function normalizePrivateKey(string $raw): string
    {
        return self::normalizePem($raw, 'PRIVATE KEY');
    }

    public static function normalizePublicKey(string $raw): string
    {
        return self::normalizePem($raw, 'PUBLIC KEY');
    }

    protected static function normalizePem(string $raw, string $label): string
    {
        $key = trim(str_replace(["\r\n", "\r", "\0"], ["\n", "\n", ''], $raw));
        if ($key === '') {
            return '';
        }
        if (str_contains($key, 'BEGIN') && str_contains($key, $label)) {
            return $key;
        }
        $body = chunk_split((string) preg_replace('/\s+/', '', $key), 64, "\n");

        return "-----BEGIN {$label}-----\n".trim($body)."\n-----END {$label}-----";
    }

    /** Generates and stores an RSA-4096 keypair; only the public key is returned. */
    public function generateKeypair(int $bits = 4096): string
    {
        if (! function_exists('openssl_pkey_new')) {
            throw new MarketplaceException(__('marketplace.digikala_openssl_missing'), 503);
        }
        @set_time_limit(120);
        $res = openssl_pkey_new(['private_key_bits' => $bits, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $private = '';
        if ($res === false || ! openssl_pkey_export($res, $private) || $private === '') {
            throw new MarketplaceException(__('marketplace.digikala_keygen_failed').$this->opensslError(), 500);
        }
        $public = (string) (openssl_pkey_get_details($res)['key'] ?? '');
        if ($public === '') {
            throw new MarketplaceException(__('marketplace.digikala_keygen_failed'), 500);
        }
        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, [
            'private_key' => $private,
            'public_key' => $public,
        ]);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'RSA keypair generated');

        return $public;
    }

    protected function opensslError(): string
    {
        $e = function_exists('openssl_error_string') ? (string) openssl_error_string() : '';

        return $e !== '' ? ' ('.$e.')' : '';
    }

    /** Standard base64, then URL-safe, then lenient decoding. */
    public static function decodeCiphertext(string $encoded): string|false
    {
        $encoded = (string) preg_replace('/\s+/', '', trim($encoded));
        if ($encoded === '') {
            return false;
        }
        $bin = base64_decode($encoded, true);
        if ($bin !== false && $bin !== '') {
            return $bin;
        }
        $safe = strtr($encoded, '-_', '+/');
        if ($pad = strlen($safe) % 4) {
            $safe .= str_repeat('=', 4 - $pad);
        }
        $bin = base64_decode($safe, true);
        if ($bin !== false && $bin !== '') {
            return $bin;
        }
        $bin = base64_decode($encoded, false);

        return ($bin !== false && $bin !== '') ? $bin : false;
    }

    public static function decryptAuthorizationCode(string $encryptedCode, string $privateKey): string
    {
        $encryptedCode = trim($encryptedCode);
        $privateKey = self::normalizePrivateKey($privateKey);
        if ($encryptedCode === '') {
            throw new MarketplaceException(__('marketplace.digikala_code_required'), 422);
        }
        if ($privateKey === '') {
            throw new MarketplaceException(__('marketplace.digikala_private_key_missing'), 422);
        }
        $bin = self::decodeCiphertext($encryptedCode);
        if ($bin === false) {
            throw new MarketplaceException(__('marketplace.digikala_code_not_base64'), 422);
        }
        $key = openssl_pkey_get_private($privateKey);
        if ($key === false) {
            $alt = str_replace(['BEGIN PRIVATE KEY', 'END PRIVATE KEY'], ['BEGIN RSA PRIVATE KEY', 'END RSA PRIVATE KEY'], $privateKey);
            $key = openssl_pkey_get_private($alt);
        }
        if ($key === false) {
            throw new MarketplaceException(__('marketplace.digikala_private_key_invalid'), 422);
        }
        foreach ([OPENSSL_PKCS1_PADDING, OPENSSL_PKCS1_OAEP_PADDING] as $padding) {
            $plain = '';
            if (@openssl_private_decrypt($bin, $plain, $key, $padding) && $plain !== '') {
                return trim($plain);
            }
        }
        if (function_exists('openssl_pkey_decrypt')) {
            foreach (['sha256', 'sha1'] as $digest) {
                $plain = '';
                if (@openssl_pkey_decrypt($bin, $plain, $key, OPENSSL_PKCS1_OAEP_PADDING, $digest) && $plain !== '') {
                    return trim($plain);
                }
            }
        }

        throw new MarketplaceException(__('marketplace.digikala_decrypt_failed'), 422);
    }

    /** Decrypt the seller-panel code, exchange it for tokens and clear the stored code. */
    public function issueFromEncryptedCode(?string $encryptedCode = null): array
    {
        $c = $this->credentials();
        $code = $encryptedCode !== null && trim($encryptedCode) !== ''
            ? (string) preg_replace('/\s+/', '', $encryptedCode)
            : (string) ($c['encrypted_code'] ?? '');
        $plain = self::decryptAuthorizationCode($code, (string) ($c['private_key'] ?? ''));

        $res = MarketplaceHttp::request('POST', MarketplaceHttp::join($this->baseUrl(), self::TOKEN_PATH), [
            'body' => ['authorization_code' => $plain],
            'headers' => ['Accept' => 'application/json'],
            'timeout' => 45,
        ]);
        $data = is_array($res['data'] ?? null) ? $res['data'] : $res;
        if (empty($data['access_token'])) {
            throw new MarketplaceException(__('marketplace.digikala_token_missing'), 422);
        }
        $this->persistTokens($data);
        $this->settings->patchCredentials($this->tenantId, self::PLATFORM, ['encrypted_code' => '']);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Digikala token issued');

        return $this->status();
    }

    public function refresh(): string
    {
        $t = $this->tokens();
        if (empty($t['refresh_token'])) {
            throw new MarketplaceException(__('marketplace.digikala_refresh_missing'), 401);
        }
        if (! empty($t['refresh_expires_at']) && (int) $t['refresh_expires_at'] <= time()) {
            throw new MarketplaceException(__('marketplace.digikala_refresh_expired'), 401);
        }
        if (empty($t['access_token'])) {
            throw new MarketplaceException(__('marketplace.digikala_refresh_missing'), 401);
        }
        try {
            $res = MarketplaceHttp::request('POST', MarketplaceHttp::join($this->baseUrl(), self::REFRESH_PATH), [
                'body' => ['access_token' => $t['access_token'], 'refresh_token' => $t['refresh_token']],
                'headers' => ['Accept' => 'application/json'],
                'timeout' => 45,
            ]);
        } catch (MarketplaceException $e) {
            MarketplaceLogger::error($this->tenantId, self::PLATFORM, 'auth', 'Digikala token refresh failed: '.$e->getMessage());
            throw $e;
        }
        $data = is_array($res['data'] ?? null) ? $res['data'] : $res;
        if (empty($data['access_token'])) {
            throw new MarketplaceException(__('marketplace.digikala_refresh_failed'), 401);
        }
        $this->persistTokens($data);
        MarketplaceLogger::info($this->tenantId, self::PLATFORM, 'auth', 'Digikala token refreshed');

        return (string) $data['access_token'];
    }

    /** Valid access token, refreshing when it expires within 60 seconds. */
    public function accessToken(): string
    {
        $t = $this->tokens();
        $access = (string) ($t['access_token'] ?? '');
        $exp = (int) ($t['access_expires_at'] ?? 0);
        if ($access !== '' && $exp > time() + 60) {
            return $access;
        }
        if ($access !== '' && $exp === 0 && empty($t['refresh_token'])) {
            return $access;
        }
        if ($access === '' && empty($t['refresh_token'])) {
            throw new MarketplaceException(__('marketplace.digikala_not_connected'), 401);
        }

        return $this->refresh();
    }
}
