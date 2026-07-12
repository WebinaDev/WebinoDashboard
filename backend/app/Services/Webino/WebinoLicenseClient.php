<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Calls Webino parity endpoints:
 * POST /api/webinocrm/v1/license/check|activate
 * Body uses HMAC signature when WEBINOCRM_LICENSE_HMAC_SECRET is set.
 */
class WebinoLicenseClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    public function check(string $domain, ?string $licenseKey = null): array
    {
        return $this->post('/api/webinocrm/v1/license/check', $domain, $licenseKey);
    }

    /**
     * PAT-injected HTTPS clone URL when CRM hosting git_pat is configured.
     */
    public function moduleCloneUrl(string $domain, ?string $licenseKey, string $moduleSlug): ?string
    {
        $ts = time();
        $body = [
            'domain' => $domain,
            'module_slug' => $moduleSlug,
            'ts' => $ts,
        ];
        if ($licenseKey !== null && $licenseKey !== '') {
            $body['license_key'] = $licenseKey;
        }

        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret !== '') {
            $key = (string) ($licenseKey ?? '');
            $body['signature'] = hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret);
        }

        $url = $this->baseUrl().'/api/webinocrm/v1/license/module-clone-url';
        $res = Http::timeout(20)
            ->acceptJson()
            ->asJson()
            ->post($url, $body);

        if (! $res->successful()) {
            return null;
        }

        $u = data_get($res->json(), 'data.clone_url');

        return is_string($u) && $u !== '' ? $u : null;
    }

    public function activate(array $payload): array
    {
        $ts = time();
        $body = array_merge([
            'domain' => $payload['domain'] ?? request()->getHost(),
            'license_key' => $payload['license_key'],
            'ts' => $ts,
        ], $payload);

        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret !== '') {
            $domain = (string) $body['domain'];
            $key = (string) $body['license_key'];
            $body['signature'] = hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret);
        }

        $url = $this->baseUrl().'/api/webinocrm/v1/license/activate';

        return Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->post($url, $body)
            ->throw()
            ->json();
    }

    protected function post(string $path, string $domain, ?string $licenseKey): array
    {
        $ts = time();
        $body = [
            'domain' => $domain,
            'ts' => $ts,
        ];
        if ($licenseKey !== null) {
            $body['license_key'] = $licenseKey;
        }

        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret !== '') {
            $key = (string) ($licenseKey ?? '');
            $body['signature'] = hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret);
        }

        $url = $this->baseUrl().$path;

        return Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->post($url, $body)
            ->json();
    }
}
