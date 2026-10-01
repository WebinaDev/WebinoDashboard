<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Module marketplace against ERP webinocrm endpoints:
 * GET/POST /api/webinocrm/v1/marketplace/catalog|purchase|payment-callback
 */
class WebinoMarketplaceClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    protected function requireSecret(): string
    {
        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret === '') {
            throw new \RuntimeException('License HMAC secret is not configured');
        }

        return $secret;
    }

    /**
     * @return array<string, mixed>
     */
    protected function signedBody(string $domain, ?string $licenseKey, array $extra = []): array
    {
        $ts = time();
        $key = (string) ($licenseKey ?? '');
        $body = array_merge([
            'domain' => $domain,
            'ts' => $ts,
            'signature' => hash_hmac('sha256', $domain.'|'.$key.'|'.$ts, $this->requireSecret()),
        ], $extra);
        if ($licenseKey !== null && $licenseKey !== '') {
            $body['license_key'] = $licenseKey;
        }

        return $body;
    }

    /**
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function catalog(string $domain, ?string $licenseKey, bool $includeCore = false): array
    {
        $url = $this->baseUrl().'/api/webinocrm/v1/marketplace/catalog';
        $body = $this->signedBody($domain, $licenseKey, ['include_core' => $includeCore ? 1 : 0]);

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
    public function purchase(string $domain, string $licenseKey, array $payload): array
    {
        $url = $this->baseUrl().'/api/webinocrm/v1/marketplace/purchase';
        $body = $this->signedBody($domain, $licenseKey, $payload);

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
