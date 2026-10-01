<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Module marketplace against ERP webinocrm endpoints.
 * Entitlement: domain (+ product). HMAC is optional service auth only.
 */
class WebinoMarketplaceClient
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

    /** Optional deploy-time service auth; empty is OK. */
    protected function licenseSecret(): string
    {
        return (string) config('services.webino.license_hmac_secret', '');
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function requestBody(string $domain, ?string $product = null, array $extra = []): array
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
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function catalog(string $domain, ?string $product = null, bool $includeCore = false): array
    {
        $url = $this->baseUrl().'/api/webinocrm/v1/marketplace/catalog';
        $body = $this->requestBody($domain, $product, ['include_core' => $includeCore ? 1 : 0]);

        try {
            $res = Http::timeout(20)->acceptJson()->asJson()->post($url, $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 502, 'data' => null, 'message' => $e->getMessage()];
        }

        return [
            'ok' => $res->successful(),
            'status' => $res->status(),
            'data' => $res->json(),
            'message' => $res->successful() ? null : (string) data_get($res->json(), 'message', $res->body()),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function purchase(string $domain, array $payload, ?string $product = null): array
    {
        $url = $this->baseUrl().'/api/webinocrm/v1/marketplace/purchase';
        $body = $this->requestBody($domain, $product, $payload);
        unset($body['license_key']);

        try {
            $res = Http::timeout(30)->acceptJson()->asJson()->post($url, $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 502, 'data' => null, 'message' => $e->getMessage()];
        }

        return [
            'ok' => $res->successful(),
            'status' => $res->status(),
            'data' => $res->json(),
            'message' => $res->successful() ? null : (string) data_get($res->json(), 'message', $res->body()),
        ];
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function paymentCallback(array $query): array
    {
        $url = $this->baseUrl().'/api/webinocrm/v1/marketplace/payment-callback';

        try {
            $res = Http::timeout(30)->acceptJson()->asJson()->post($url, $query);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 502, 'data' => null, 'message' => $e->getMessage()];
        }

        return [
            'ok' => $res->successful(),
            'status' => $res->status(),
            'data' => $res->json(),
            'message' => $res->successful() ? null : (string) data_get($res->json(), 'message', $res->body()),
        ];
    }
}
