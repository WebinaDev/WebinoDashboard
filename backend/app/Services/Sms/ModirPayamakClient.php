<?php

namespace App\Services\Sms;

use App\Models\Tenant;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Support\Facades\Http;

/**
 * Proxies ModirPayamak admin calls to WebinaCRM.
 */
class ModirPayamakClient
{
    public function __construct(protected WebinoLicenseClient $license) {}

    /**
     * @param  array<string, mixed>  $query
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function get(Tenant $tenant, string $path, array $query = []): array
    {
        $query = array_merge($query, $this->identity($tenant));
        $url = $this->url($path);

        try {
            $res = Http::timeout(20)->acceptJson()->get($url, $query);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 200, 'data' => ['ok' => false, 'unavailable' => true, 'message' => $e->getMessage()]];
        }

        return $this->normalize($res->status(), $res->json());
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function post(Tenant $tenant, string $path, array $body = []): array
    {
        $body = array_merge($body, $this->identity($tenant));
        $url = $this->url($path);

        try {
            $res = Http::timeout(30)->acceptJson()->asJson()->post($url, $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 200, 'data' => ['ok' => false, 'unavailable' => true, 'message' => $e->getMessage()]];
        }

        return $this->normalize($res->status(), $res->json());
    }

    /**
     * @return array{domain: string, product?: string}
     */
    protected function identity(Tenant $tenant): array
    {
        $out = ['domain' => (string) ($tenant->domain ?: 'localhost')];
        $out['product'] = (string) config('services.webino.product', 'webinodashboard');

        return $out;
    }

    /**
     * Reject traversal and unexpected characters before the path is joined to the ERP base URL.
     */
    public static function normalizePath(string $path): string
    {
        $path = str_replace('\\', '/', rawurldecode($path));
        $path = trim($path);
        if (str_contains($path, "\0") || str_contains($path, '..') || str_contains($path, '//')) {
            throw new \InvalidArgumentException('Invalid ModirPayamak path');
        }
        $path = trim($path, '/');
        if ($path !== '' && ! preg_match('#^[A-Za-z0-9_/-]+$#', $path)) {
            throw new \InvalidArgumentException('Invalid ModirPayamak path');
        }
        if ($path !== '') {
            foreach (explode('/', $path) as $segment) {
                if ($segment === '' || $segment === '.' || $segment === '..') {
                    throw new \InvalidArgumentException('Invalid ModirPayamak path');
                }
            }
        }
        if (str_starts_with($path, 'modirpayamak/')) {
            $path = substr($path, strlen('modirpayamak/'));
        } elseif ($path === 'modirpayamak') {
            $path = '';
        }

        return $path;
    }

    protected function url(string $path): string
    {
        $path = self::normalizePath($path);
        $path = 'modirpayamak/'.$path;

        return rtrim($this->license->baseUrl(), '/').'/api/webinocrm/v1/'.$path;
    }

    /**
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    protected function normalize(int $status, mixed $json): array
    {
        if ($status >= 200 && $status < 300) {
            return [
                'ok' => true,
                'status' => 200,
                'data' => is_array($json) ? $json : ['ok' => true, 'data' => $json],
            ];
        }

        $message = is_array($json)
            ? (string) ($json['message'] ?? $json['error'] ?? 'CRM request failed')
            : 'CRM request failed';

        return [
            'ok' => false,
            'status' => 200,
            'data' => [
                'ok' => false,
                'unavailable' => true,
                'message' => $message,
                'crm_status' => $status,
            ],
        ];
    }
}
