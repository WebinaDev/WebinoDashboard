<?php

namespace App\Services\Webino;

use App\Models\Tenant;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Platform bills (SMS credit, invoices, marketplace licenses) are charged by ERP.
 * Dashboard only opens a payment session and reads status back.
 *
 * Contract:
 *   GET  /api/v1/tenant/billing/outstanding
 *   POST /api/v1/tenant/billing/payments   { bill_id, mode, gateway, return_url }
 *   GET  /api/v1/tenant/billing/payments/{id}
 */
class WebinoTenantBillingClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    public function token(): string
    {
        return (string) config('services.webino.erp_api_token', '');
    }

    public function isConfigured(): bool
    {
        return $this->baseUrl() !== '' && $this->token() !== '';
    }

    public function usesStub(): bool
    {
        $mode = strtolower((string) config('services.webino.billing_mode', 'auto'));
        if ($mode === 'stub') {
            return true;
        }
        if ($mode === 'live') {
            return false;
        }

        return ! $this->isConfigured();
    }

    /**
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    public function outstanding(Tenant $tenant): array
    {
        if ($this->usesStub()) {
            return [
                'ok' => true,
                'status' => 200,
                'source' => 'stub',
                'data' => $this->stubOutstanding($tenant),
            ];
        }

        $res = $this->request($tenant, 'GET', '/api/v1/tenant/billing/outstanding');
        if (! $res['ok']) {
            return $res;
        }

        return [
            'ok' => true,
            'status' => $res['status'],
            'source' => 'erp',
            'data' => $this->normalizeOutstanding($res['data']),
        ];
    }

    /**
     * @param  array{bill_id: string, mode: string, gateway: string, return_url: string}  $body
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    public function createPayment(Tenant $tenant, array $body): array
    {
        if ($this->usesStub()) {
            return $this->stubCreate($tenant, $body);
        }

        $res = $this->request($tenant, 'POST', '/api/v1/tenant/billing/payments', $body);
        if (! $res['ok']) {
            return $res;
        }
        $payload = $this->unwrap($res['data']);

        return [
            'ok' => true,
            'status' => 201,
            'source' => 'erp',
            'data' => [
                'payment_id' => (string) ($payload['payment_id'] ?? data_get($payload, 'payment.id') ?? ''),
                'redirect_url' => (string) ($payload['redirect_url'] ?? ''),
                'status' => (string) ($payload['status'] ?? 'pending'),
                'base_minor' => isset($payload['base_minor']) ? (int) $payload['base_minor'] : null,
                'fee_percent' => isset($payload['fee_percent']) ? (float) $payload['fee_percent'] : null,
                'fee_minor' => isset($payload['fee_minor']) ? (int) $payload['fee_minor'] : null,
                'total_minor' => isset($payload['total_minor']) ? (int) $payload['total_minor'] : null,
            ],
        ];
    }

    /**
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    public function payment(Tenant $tenant, string $paymentId): array
    {
        if ($this->usesStub()) {
            return $this->stubPayment($tenant, $paymentId);
        }

        $res = $this->request($tenant, 'GET', '/api/v1/tenant/billing/payments/'.rawurlencode($paymentId));
        if (! $res['ok']) {
            return $res;
        }
        $payload = $this->unwrap($res['data']);
        $status = strtolower((string) ($payload['status'] ?? 'pending'));
        if (! in_array($status, ['pending', 'paid', 'failed'], true)) {
            $status = 'pending';
        }

        return [
            'ok' => true,
            'status' => 200,
            'source' => 'erp',
            'data' => [
                'payment_id' => (string) ($payload['payment_id'] ?? $paymentId),
                'status' => $status,
                'bill_id' => isset($payload['bill_id']) ? (string) $payload['bill_id'] : null,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    protected function request(Tenant $tenant, string $method, string $path, array $body = []): array
    {
        if (! $this->isConfigured()) {
            return [
                'ok' => false,
                'status' => 503,
                'source' => 'erp',
                'data' => [],
                'message' => 'WEBINO_ERP_API_TOKEN not configured',
            ];
        }

        $url = $this->baseUrl().'/'.ltrim($path, '/');
        $headers = [
            'X-Tenant-Domain' => (string) $tenant->domain,
            'X-Site-Domain' => (string) $tenant->domain,
        ];
        $siteToken = (string) ($tenant->provision_token ?? '');
        if ($siteToken !== '') {
            $headers['X-Site-Token'] = $siteToken;
        }

        try {
            $req = Http::timeout(25)->acceptJson()->withToken($this->token())->withHeaders($headers);
            $query = [
                'domain' => (string) $tenant->domain,
                'product' => (string) config('services.webino.product', 'webinodashboard'),
            ];
            $res = strtoupper($method) === 'GET'
                ? $req->get($url, $query)
                : $req->asJson()->post($url, array_merge($query, $body));
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'status' => 502,
                'source' => 'erp',
                'data' => [],
                'message' => $e->getMessage(),
            ];
        }

        return [
            'ok' => $res->successful(),
            'status' => $res->status(),
            'source' => 'erp',
            'data' => is_array($res->json()) ? $res->json() : [],
            'message' => $res->successful() ? null : (string) data_get($res->json(), 'message', $res->body()),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function normalizeOutstanding(array $payload): array
    {
        $data = $this->unwrap($payload);
        $bills = is_array($data['bills'] ?? null) ? $data['bills'] : [];
        $gateways = is_array($data['gateways'] ?? null) ? $data['gateways'] : [];

        return [
            'bills' => array_values(array_filter($bills, 'is_array')),
            'gateways' => array_values(array_filter(array_map(function ($row) {
                if (! is_array($row) || ($row['id'] ?? '') === '') {
                    return null;
                }

                return [
                    'id' => (string) $row['id'],
                    'label' => (string) ($row['label'] ?? $row['id']),
                    'enabled' => (bool) ($row['enabled'] ?? false),
                    'modes' => array_values(array_filter((array) ($row['modes'] ?? []), 'is_string')),
                    'fee_percent' => round((float) ($row['fee_percent'] ?? 0), 2),
                ];
            }, $gateways))),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function unwrap(array $payload): array
    {
        $data = $payload['data'] ?? $payload;

        return is_array($data) ? $data : [];
    }

    /** @return array<string, mixed> */
    protected function stubOutstanding(Tenant $tenant): array
    {
        $paid = $this->stubPaidBillIds($tenant);

        $bills = array_values(array_filter([
            [
                'id' => 'sms-pkg-1',
                'kind' => 'sms',
                'title' => 'بسته پیامک',
                'amount_minor' => 250000,
                'currency' => 'IRT',
                'status' => 'open',
            ],
            [
                'id' => 'inv-1042',
                'kind' => 'invoice',
                'title' => 'فاکتور پلتفرم',
                'amount_minor' => 1800000,
                'currency' => 'IRT',
                'status' => 'open',
            ],
            [
                'id' => 'mkt-analytics',
                'kind' => 'marketplace',
                'title' => 'مجوز بازارچه',
                'amount_minor' => 900000,
                'currency' => 'IRT',
                'status' => 'open',
            ],
        ], fn (array $bill) => ! in_array($bill['id'], $paid, true)));

        return [
            'bills' => $bills,
            'gateways' => [
                ['id' => 'zarinpal', 'label' => 'زرین‌پال', 'enabled' => true, 'modes' => ['cash'], 'fee_percent' => 1],
                ['id' => 'digipay', 'label' => 'دیجی‌پی', 'enabled' => true, 'modes' => ['cash', 'installment'], 'fee_percent' => 0],
                ['id' => 'snapppay', 'label' => 'اسنپ‌پی', 'enabled' => false, 'modes' => ['installment'], 'fee_percent' => 2.5],
                ['id' => 'torobpay', 'label' => 'ترب‌پی', 'enabled' => true, 'modes' => ['installment'], 'fee_percent' => 0],
            ],
        ];
    }

    /**
     * @param  array{bill_id: string, mode: string, gateway: string, return_url: string}  $body
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    protected function stubCreate(Tenant $tenant, array $body): array
    {
        $outstanding = $this->stubOutstanding($tenant);
        $bill = collect($outstanding['bills'])->firstWhere('id', $body['bill_id']);
        $gateway = collect($outstanding['gateways'])->firstWhere('id', $body['gateway']);
        if (! is_array($bill)) {
            return ['ok' => false, 'status' => 404, 'source' => 'stub', 'data' => [], 'message' => 'Bill not found'];
        }
        if (! is_array($gateway) || empty($gateway['enabled']) || ! in_array($body['mode'], $gateway['modes'] ?? [], true)) {
            return ['ok' => false, 'status' => 422, 'source' => 'stub', 'data' => [], 'message' => 'Gateway is not enabled for this mode'];
        }

        $paymentId = 'stub_'.$tenant->id.'_'.bin2hex(random_bytes(6));
        $bag = $this->stubBag($tenant);
        $bag[$paymentId] = [
            'payment_id' => $paymentId,
            'bill_id' => $body['bill_id'],
            'status' => 'pending',
            'gateway' => $body['gateway'],
            'mode' => $body['mode'],
        ];
        Cache::put($this->stubKey($tenant), $bag, now()->addDay());

        $return = $body['return_url'];
        $join = str_contains($return, '?') ? '&' : '?';

        return [
            'ok' => true,
            'status' => 201,
            'source' => 'stub',
            'data' => [
                'payment_id' => $paymentId,
                'redirect_url' => $return.$join.'gateway='.rawurlencode($body['gateway']).'&erp_payment_id='.rawurlencode($paymentId),
                'status' => 'pending',
                'base_minor' => null,
                'fee_percent' => null,
                'fee_minor' => null,
                'total_minor' => null,
            ],
        ];
    }

    /**
     * @return array{ok: bool, status: int, source: string, data: array<string, mixed>, message?: string}
     */
    protected function stubPayment(Tenant $tenant, string $paymentId): array
    {
        $bag = $this->stubBag($tenant);
        $row = $bag[$paymentId] ?? null;
        if (! is_array($row)) {
            return ['ok' => false, 'status' => 404, 'source' => 'stub', 'data' => [], 'message' => 'Payment not found'];
        }
        if (($row['status'] ?? '') === 'pending' && (bool) config('services.webino.billing_stub_autopay', false)) {
            $row['status'] = 'paid';
            $bag[$paymentId] = $row;
            Cache::put($this->stubKey($tenant), $bag, now()->addDay());
        }

        return [
            'ok' => true,
            'status' => 200,
            'source' => 'stub',
            'data' => [
                'payment_id' => $paymentId,
                'status' => (string) $row['status'],
                'bill_id' => (string) ($row['bill_id'] ?? ''),
            ],
        ];
    }

    /** @return list<string> */
    protected function stubPaidBillIds(Tenant $tenant): array
    {
        $ids = [];
        foreach ($this->stubBag($tenant) as $row) {
            if (is_array($row) && ($row['status'] ?? '') === 'paid' && isset($row['bill_id'])) {
                $ids[] = (string) $row['bill_id'];
            }
        }

        return $ids;
    }

    /** @return array<string, mixed> */
    protected function stubBag(Tenant $tenant): array
    {
        $bag = Cache::get($this->stubKey($tenant));

        return is_array($bag) ? $bag : [];
    }

    protected function stubKey(Tenant $tenant): string
    {
        return 'billing-stub:'.$tenant->id;
    }
}
