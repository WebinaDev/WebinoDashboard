<?php

namespace App\Services\Webino;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Calls Webino parity endpoints:
 * POST /api/webinocrm/v1/license/check|activate
 *
 * Entitlement identity is domain (+ product). No license code.
 * HMAC secret is optional service-to-service auth — never required for
 * domain entitlement checks. Canonical HMAC payload: domain|{product}|ts
 *
 * Expected WEBINO_BASE_URL:
 * - Same-VPS (Docker webino_sites): http://erp-backend:8080
 * - Public / remote: https://webinaagency.ir (ERP public_crm_url / APP_URL)
 * Path: /api/webinocrm/v1/license/check
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
        try {
            $res = Http::timeout(20)
                ->acceptJson()
                ->asJson()
                ->post($url, $body);
        } catch (Throwable $e) {
            Log::warning('webino.license_module_clone_transport', [
                'url' => $url,
                'message' => $e->getMessage(),
            ]);

            return null;
        }

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
        $base = $this->baseUrl();
        $host = strtolower((string) (parse_url($base, PHP_URL_HOST) ?: ''));
        if ($base === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return [
                'error' => [
                    'code' => 'WEBINO_BASE_URL_MISSING',
                    'message' => 'WEBINO_BASE_URL is not configured. Expected ERP URL (same-VPS: http://erp-backend:8080, public: https://webinaagency.ir).',
                ],
            ];
        }

        $body = $this->requestBody($domain, $product);
        $url = $base.$path;

        try {
            $res = Http::timeout(15)
                ->acceptJson()
                ->asJson()
                ->post($url, $body);
        } catch (ConnectionException $e) {
            Log::warning('webino.license_check_transport', [
                'url' => $url,
                'domain' => $domain,
                'message' => $e->getMessage(),
            ]);

            throw $e;
        } catch (Throwable $e) {
            Log::warning('webino.license_check_transport', [
                'url' => $url,
                'domain' => $domain,
                'message' => $e->getMessage(),
            ]);

            throw $e;
        }

        $json = $res->json();
        if (! is_array($json) || data_get($json, 'data') === null) {
            $snippet = trim(mb_substr(strip_tags($res->body()), 0, 180));
            $msg = 'ERP license HTTP '.$res->status();
            if ($snippet !== '') {
                $msg .= ': '.$snippet;
            } else {
                $msg .= ' (empty/non-JSON body)';
            }

            Log::warning('webino.license_check_bad_response', [
                'url' => $url,
                'domain' => $domain,
                'http_status' => $res->status(),
                'snippet' => $snippet,
            ]);

            return [
                'error' => [
                    'code' => 'LICENSE_BAD_RESPONSE',
                    'message' => $msg,
                    'http_status' => $res->status(),
                    'erp_body' => is_array($json) ? $json : null,
                ],
            ];
        }

        if (! $res->successful()) {
            $erpMessage = (string) (
                data_get($json, 'error.message')
                ?? data_get($json, 'message')
                ?? ('ERP license HTTP '.$res->status())
            );

            Log::warning('webino.license_check_http_error', [
                'url' => $url,
                'domain' => $domain,
                'http_status' => $res->status(),
                'message' => $erpMessage,
            ]);

            return [
                'error' => [
                    'code' => (string) (data_get($json, 'error.code') ?: 'LICENSE_HTTP_'.$res->status()),
                    'message' => $erpMessage,
                    'http_status' => $res->status(),
                    'erp_body' => $json,
                ],
            ];
        }

        return $json;
    }
}
