<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/** Live ERP ledger via /api/webinocrm/v1/accounting/ledger — domain (+ product) identity. */
class WebinoAccountingClient
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

    protected function requireSecret(): string
    {
        $secret = (string) config('services.webino.license_hmac_secret');
        if ($secret === '') {
            throw new \RuntimeException('License HMAC secret is not configured');
        }

        return $secret;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{ok: bool, status: int, data: mixed, message?: string, unavailable?: bool}
     */
    public function ledger(string $domain, ?string $product = null, array $filters = []): array
    {
        $ts = time();
        $product = strtolower(trim((string) ($product ?? $this->productSlug())));
        if ($product === '') {
            $product = $this->productSlug();
        }
        $body = array_merge($filters, [
            'domain' => $domain,
            'product' => $product,
            'ts' => $ts,
            'signature' => hash_hmac('sha256', $domain.'|'.$product.'|'.$ts, $this->requireSecret()),
        ]);
        unset($body['license_key']);

        $url = $this->baseUrl().'/api/webinocrm/v1/accounting/ledger';

        try {
            $res = Http::timeout(25)->acceptJson()->asJson()->post($url, $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 502, 'data' => null, 'message' => $e->getMessage(), 'unavailable' => true];
        }

        $json = $res->json();
        $unavailable = (bool) data_get($json, 'unavailable', false) || ! $res->successful();

        return [
            'ok' => $res->successful() && ! $unavailable,
            'status' => $res->status(),
            'data' => $json,
            'message' => $unavailable ? (string) data_get($json, 'message', 'ERP ledger unavailable') : null,
            'unavailable' => $unavailable,
        ];
    }
}
