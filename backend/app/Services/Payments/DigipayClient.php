<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/** Digipay UPG OAuth + ticket helpers using tenant settings. */
class DigipayClient
{
    /**
     * @param  array<string, mixed>  $settings
     */
    public function bearerToken(array $settings): ?string
    {
        $username = (string) ($settings['username'] ?? '');
        $password = (string) ($settings['password'] ?? '');
        $clientId = (string) ($settings['client_id'] ?? '');
        $clientSecret = (string) ($settings['client_secret'] ?? '');
        $base = $this->baseUrl($settings);

        if ($username === '' || $password === '' || $clientId === '' || $clientSecret === '') {
            return null;
        }

        $cacheKey = 'digipay:token:'.md5($base.'|'.$clientId.'|'.$username);
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $basic = base64_encode($clientId.':'.$clientSecret);
        $res = Http::asForm()
            ->withHeaders(['Authorization' => 'Basic '.$basic])
            ->timeout(30)
            ->post($base.'/oauth/token', [
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
     */
    public function baseUrl(array $settings): string
    {
        $env = (string) ($settings['environment'] ?? 'staging');

        return $env === 'live'
            ? 'https://api.mydigipay.com/digipay/api'
            : 'https://uat.mydigipay.info/digipay/api';
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public function version(array $settings): string
    {
        $v = trim((string) ($settings['digipay_version'] ?? '2022-02-02'));

        return $v !== '' ? $v : '2022-02-02';
    }
}
