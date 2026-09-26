<?php

namespace App\Services\Shipping;

use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Tapin / Posteketab public v2 API client + tenant settings.
 *
 * @see https://docs.tapin.ir/
 */
class TapinClient
{
    public const MODULE = 'shipping';

    public const SUB = 'tapin';

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'enabled' => false,
            'token' => '',
            'shop_id' => '',
            'shop_title' => '',
            'gateway' => 'tapin',
            'show_credit' => true,
            'use_pws_formula' => true,
            'content_type' => 1,
            'tipax_pickup_type' => 10,
            'tipax_delivery_type' => 10,
            'origin_province_code' => 0,
            'origin_city_code' => 0,
            'auto_register' => false,
            'auto_register_status' => 'processing',
            'register_type' => 1,
            'default_pay_type' => 1,
            'default_order_type' => 0,
            'has_insurance' => false,
            'employee_code' => -1,
            'methods' => [
                'pishtaz' => true,
                'vip' => true,
                'tipax' => true,
                'courier' => true,
                'tipax_api' => true,
                'alonomic' => false,
            ],
            'courier_base_price' => 0,
            'courier_per_kg' => 0,
            'free_shipping_min' => 0,
            'rate_extra_percent' => 0,
            'rate_extra_fixed' => 0,
            'default_box_id' => 1,
            'default_kiosk_id' => 0,
            'notify_customer_link' => true,
            'locations' => ['provinces' => []],
        ];
    }

    /** @return array<string, mixed> */
    public function getRaw(int $tenantId): array
    {
        return $this->settings->get($tenantId, self::MODULE, self::SUB, $this->defaults());
    }

    /** @return array<string, mixed> */
    public function getPublic(int $tenantId): array
    {
        $raw = $this->getRaw($tenantId);
        $hasToken = filled($raw['token'] ?? null);
        unset($raw['token']);
        $raw['has_token'] = $hasToken;
        $raw['connected'] = $hasToken && filled($raw['shop_id'] ?? null);

        return $raw;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function save(int $tenantId, array $input): array
    {
        $current = $this->getRaw($tenantId);
        $defaults = $this->defaults();
        foreach ($defaults as $key => $default) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            if ($key === 'token') {
                $val = $input['token'];
                if ($val === null || $val === '' || (is_string($val) && str_contains($val, '•'))) {
                    continue;
                }
                $current['token'] = (string) $val;
                continue;
            }
            if ($key === 'locations') {
                continue;
            }
            if (is_array($default) && is_array($input[$key])) {
                $current[$key] = array_merge($default, $input[$key]);
            } elseif (is_bool($default)) {
                $current[$key] = (bool) $input[$key];
            } elseif (is_int($default)) {
                $current[$key] = (int) $input[$key];
            } else {
                $current[$key] = $input[$key];
            }
        }
        $this->settings->put($tenantId, self::MODULE, self::SUB, $current);

        return $this->getPublic($tenantId);
    }

    public function isReady(int $tenantId): bool
    {
        $s = $this->getRaw($tenantId);

        return ! empty($s['enabled']) && filled($s['token'] ?? null) && filled($s['shop_id'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array{ok: bool, status: int, message: string, entries: mixed}
     */
    public function request(int $tenantId, string $path, array $body = [], string $method = 'POST'): array
    {
        $settings = $this->getRaw($tenantId);
        $token = (string) ($settings['token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'status' => 401, 'message' => 'Tapin token missing', 'entries' => null];
        }

        $host = (($settings['gateway'] ?? 'tapin') === 'posteketab') ? 'posteketab.com' : 'tapin.ir';
        $base = 'https://api.'.$host.'/api/v2/public';
        $url = rtrim($base, '/').'/'.ltrim($path, '/');
        if (! str_ends_with($url, '/') && ! str_contains($url, '?')) {
            $url .= '/';
        }

        if (empty($body['shop_id']) && filled($settings['shop_id'] ?? null)) {
            $body['shop_id'] = $settings['shop_id'];
        }

        try {
            $req = Http::timeout(45)
                ->withHeaders([
                    'Authorization' => $token,
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ]);
            $res = strtoupper($method) === 'GET'
                ? $req->get($url, $body)
                : $req->post($url, $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 0, 'message' => $e->getMessage(), 'entries' => null];
        }

        $json = $res->json();
        $returns = is_array($json) ? ($json['returns'] ?? []) : [];
        $status = (int) ($returns['status'] ?? $res->status());
        $ok = $status === 200 || ($res->successful() && empty($returns['status']));

        return [
            'ok' => $ok,
            'status' => $status,
            'message' => (string) ($returns['message'] ?? ($ok ? '' : 'Tapin request failed')),
            'entries' => is_array($json) ? ($json['entries'] ?? $json) : null,
        ];
    }

    /** @return array{ok: bool, status: int, message: string, entries: mixed} */
    public function shopList(int $tenantId): array
    {
        return $this->request($tenantId, 'shop/list', ['page' => 1, 'count' => 50]);
    }

    /** @return array{ok: bool, status: int, message: string, entries: mixed} */
    public function checkPrice(int $tenantId, array $payload): array
    {
        $res = $this->request($tenantId, 'order/post/check-price', $payload);
        if ($res['ok']) {
            return $res;
        }

        return $this->request($tenantId, 'order/post/price/check', $payload);
    }

    /** @return array{ok: bool, status: int, message: string, entries: mixed} */
    public function registerOrder(int $tenantId, array $payload): array
    {
        return $this->request($tenantId, 'order/post/register', $payload);
    }

    /** @return array{ok: bool, status: int, message: string, entries: mixed} */
    public function orderDetail(int $tenantId, array $payload): array
    {
        return $this->request($tenantId, 'order/post/detail', $payload);
    }

    /** @return array{ok: bool, status: int, message: string, entries: mixed} */
    public function labelHtml(int $tenantId, array $payload): array
    {
        return $this->request($tenantId, 'order/post/label', $payload);
    }

    /** @return float|null */
    public function creditAmount(int $tenantId, bool $force = false): ?float
    {
        $key = 'tapin:credit:'.$tenantId;
        if (! $force) {
            $cached = Cache::get($key);
            if (is_numeric($cached)) {
                return ((float) $cached >= 0) ? (float) $cached : null;
            }
        }
        $res = $this->request($tenantId, 'transaction/credit/', []);
        $amount = null;
        if ($res['ok'] && is_array($res['entries'])) {
            foreach (['credit', 'amount', 'balance', 'wallet'] as $k) {
                if (isset($res['entries'][$k]) && is_numeric($res['entries'][$k])) {
                    $amount = (float) $res['entries'][$k];
                    break;
                }
            }
        }
        Cache::put($key, $amount ?? -1, now()->addMinutes(5));

        return $amount;
    }

    /**
     * Sync province/city tree into settings.locations.
     *
     * @return array{ok: bool, count: int, message: string}
     */
    public function syncLocations(int $tenantId): array
    {
        $res = $this->request($tenantId, 'state/tree', []);
        if (! $res['ok'] || empty($res['entries'])) {
            try {
                $http = Http::timeout(45)->acceptJson()->get('https://public.api.tapin.ir/api/v1/public/state/tree/');
                $raw = $http->json();
                $returns = is_array($raw) ? ($raw['returns'] ?? []) : [];
                if ((int) ($returns['status'] ?? 0) === 200) {
                    $res = [
                        'ok' => true,
                        'status' => 200,
                        'message' => '',
                        'entries' => $raw['entries'] ?? null,
                    ];
                }
            } catch (\Throwable) {
                // keep prior failure
            }
        }
        if (! $res['ok'] || ! is_array($res['entries'])) {
            return ['ok' => false, 'count' => 0, 'message' => $res['message'] ?: 'Location sync failed'];
        }

        $provinces = [];
        foreach ($res['entries'] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $provinces[] = [
                'code' => (int) ($row['code'] ?? $row['id'] ?? 0),
                'title' => (string) ($row['title'] ?? $row['name'] ?? ''),
                'cities' => array_values(array_map(function ($c) {
                    if (! is_array($c)) {
                        return null;
                    }

                    return [
                        'code' => (int) ($c['code'] ?? $c['id'] ?? 0),
                        'title' => (string) ($c['title'] ?? $c['name'] ?? ''),
                    ];
                }, is_array($row['cities'] ?? null) ? $row['cities'] : [])),
            ];
            $provinces[array_key_last($provinces)]['cities'] = array_values(array_filter(
                $provinces[array_key_last($provinces)]['cities']
            ));
        }

        $current = $this->getRaw($tenantId);
        $current['locations'] = ['provinces' => $provinces];
        $this->settings->put($tenantId, self::MODULE, self::SUB, $current);

        return ['ok' => true, 'count' => count($provinces), 'message' => 'Locations synced'];
    }
}
