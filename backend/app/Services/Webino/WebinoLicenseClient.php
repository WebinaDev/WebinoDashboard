<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Calls Webino parity endpoints:
 * POST /api/webinocrm/v1/license/check|activate
 * Body MUST include HMAC signature (WEBINOCRM_LICENSE_HMAC_SECRET).
 */
class WebinoLicenseClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    protected function requireLicenseSecret(): string
    {
        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret === '') {
            throw new \RuntimeException('License HMAC secret is not configured');
        }

        return $secret;
    }

    public function check(string $domain, ?string $licenseKey = null): array
    {
        return $this->post('/api/webinocrm/v1/license/check', $domain, $licenseKey);
    }

    public function moduleCloneUrl(string $domain, ?string $licenseKey, string $moduleSlug): ?string
    {
        $ts = time();
        $secret = $this->requireLicenseSecret();
        $key = (string) ($licenseKey ?? '');
        $body = [
            'domain' => $domain,
            'module_slug' => $moduleSlug,
            'ts' => $ts,
            'signature' => hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret),
        ];
        if ($licenseKey !== null && $licenseKey !== '') {
            $body['license_key'] = $licenseKey;
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
        $secret = $this->requireLicenseSecret();
        $domain = (string) ($payload['domain'] ?? request()->getHost());
        $key = (string) $payload['license_key'];
        $body = array_merge([
            'domain' => $domain,
            'license_key' => $key,
            'ts' => $ts,
            'signature' => hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret),
        ], $payload);

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
        $secret = $this->requireLicenseSecret();
        $key = (string) ($licenseKey ?? '');
        $body = [
            'domain' => $domain,
            'ts' => $ts,
            'signature' => hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $secret),
        ];
        if ($licenseKey !== null) {
            $body['license_key'] = $licenseKey;
        }

        $url = $this->baseUrl().$path;

        return Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->post($url, $body)
            ->json();
    }
}
