<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/** SnappPay / TorobPay shared OAuth + payment token client. */
class BnplClient
{
    /**
     * @param  array<string, mixed>  $settings
     */
    public function bearerToken(array $settings, string $cachePrefix): ?string
    {
        $clientId = (string) ($settings['client_id'] ?? '');
        $clientSecret = (string) ($settings['client_secret'] ?? '');
        $username = (string) ($settings['client_username'] ?? '');
        $password = (string) ($settings['client_password'] ?? '');
        $base = rtrim((string) ($settings['base_url'] ?? ''), '/');
        if ($clientId === '' || $clientSecret === '' || $username === '' || $password === '' || $base === '') {
            return null;
        }

        $cacheKey = $cachePrefix.':token:'.md5($base.'|'.$clientId.'|'.$username);
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $basic = base64_encode($clientId.':'.$clientSecret);
        $res = Http::asForm()
            ->withHeaders([
                'Authorization' => 'Basic '.$basic,
                'Accept' => 'application/json',
            ])
            ->timeout(30)
            ->post($base.'/api/online/v1/oauth/token', [
                'username' => $username,
                'password' => $password,
                'grant_type' => 'password',
            ])
            ->json();

        $token = data_get($res, 'access_token');
        if (! is_string($token) || $token === '') {
            return null;
        }
        $ttl = max(60, (int) data_get($res, 'expires_in', 3500) - 60);
        Cache::put($cacheKey, $token, $ttl);

        return $token;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $body
     * @return array{ok: bool, data: mixed, message: string}
     */
    public function post(array $settings, string $cachePrefix, string $path, array $body): array
    {
        $token = $this->bearerToken($settings, $cachePrefix);
        $base = rtrim((string) ($settings['base_url'] ?? ''), '/');
        if ($token === null || $base === '') {
            return ['ok' => false, 'data' => null, 'message' => 'BNPL credentials missing'];
        }

        $res = Http::timeout(45)
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->post($base.'/'.ltrim($path, '/'), $body);

        $json = $res->json();

        return [
            'ok' => $res->successful(),
            'data' => $json,
            'message' => (string) (data_get($json, 'message') ?? data_get($json, 'error') ?? ''),
        ];
    }
}
