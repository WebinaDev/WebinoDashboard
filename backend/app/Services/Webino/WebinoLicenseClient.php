<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Calls Webino parity endpoints:
 * POST /api/webinocrm/v1/license/check|activate
 *
 * Entitlement identity is domain (+ product). No license code.
 * HMAC secret is optional service-to-service auth — never required for
 * domain entitlement checks. Canonical HMAC payload: domain|{product}|ts
 */
class WebinoLicenseClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    public function productSlug(): string
    {
        $p = (string) config('services.webino.product', env('TENANT_PRODUCT', 'webinodashboard'));

        return $p !== '' ? strtolower($p) : 'webinodashboard';
    }

    /** Optional deploy-time service auth; empty is OK for domain status checks. */
    protected function licenseSecret(): string
    {
        return (string) config('services.webino.license_hmac_secret', '');
    }

    /**
     * @return array<string, mixed>
     */
    public function check(string $domain, ?string $product = null): array
    {
        return $this->post('/api/webinocrm/v1/license/check', $domain, $product);
    }

    public function moduleCloneUrl(string $domain, ?string $product, string $moduleSlug): ?string
    {
        $body = $this->requestBody($domain, $product, ['module_slug' => $moduleSlug]);
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

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function activate(array $payload): array
    {
        $domain = (string) ($payload['domain'] ?? request()->getHost());
        $product = (string) ($payload['product'] ?? $this->productSlug());
        $body = array_merge($this->requestBody($domain, $product), $payload, [
            'domain' => $domain,
            'product' => $product,
        ]);
        // Never require / forward a license code.
        unset($body['license_key']);

        $url = $this->baseUrl().'/api/webinocrm/v1/license/activate';

        return Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->post($url, $body)
            ->throw()
            ->json();
    }

    /**
     * Build request body. Signs only when WEBINOCRM_LICENSE_HMAC_SECRET is set.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function requestBody(string $domain, ?string $product, array $extra = []): array
    {
        $ts = time();
        $product = strtolower(trim((string) ($product ?? $this->productSlug())));
        if ($product === '') {
            $product = $this->productSlug();
        }

        $body = array_merge([
            'domain' => $domain,
            'product' => $product,
            'ts' => $ts,
        ], $extra);

        $secret = $this->licenseSecret();
        if ($secret !== '') {
            $body['signature'] = hash_hmac('sha256', $domain.'|'.$product.'|'.$ts, $secret);
        }

        return $body;
    }

    /**
     * @return array<string, mixed>
     */
    protected function post(string $path, string $domain, ?string $product): array
    {
        $body = $this->requestBody($domain, $product);
        $url = $this->baseUrl().$path;

        return Http::timeout(15)
            ->acceptJson()
            ->asJson()
            ->post($url, $body)
            ->json();
    }
}
