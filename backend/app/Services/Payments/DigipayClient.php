<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;

/** OAuth + helpers for Digipay UPG (see mydigipay.com developer docs). */
class DigipayClient
{
    public function bearerToken(): ?string
    {
        $username = (string) config('services.digipay.username');
        $password = (string) config('services.digipay.password');
        $clientId = (string) config('services.digipay.client_id');
        $clientSecret = (string) config('services.digipay.client_secret');
        $base = rtrim((string) config('services.digipay.base_url'), '/');

        if ($username === '' || $password === '' || $clientId === '' || $clientSecret === '') {
            return null;
        }

        $basic = base64_encode($clientId.':'.$clientSecret);

        $res = Http::asForm()
            ->withHeaders([
                'Authorization' => 'Basic '.$basic,
            ])
            ->timeout(30)
            ->post($base.'/oauth/token', [
                'username' => $username,
                'password' => $password,
                'grant_type' => 'password',
            ])
            ->json();

        $token = data_get($res, 'access_token');

        return is_string($token) && $token !== '' ? $token : null;
    }
}
