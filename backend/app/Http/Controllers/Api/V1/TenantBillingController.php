<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\TenantBillingPayment;
use App\Services\Webino\WebinoTenantBillingClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pay ERP platform bills from the tenant dashboard. ERP remains the processor.
 * A browser return never marks a row paid; status is read from ERP (or the stub).
 */
class TenantBillingController extends Controller
{
    public function __construct(protected WebinoTenantBillingClient $erp) {}

    public function outstanding(Request $request): JsonResponse
    {
        $tenant = $this->tenant($request);
        $res = $this->erp->outstanding($tenant);
        if (! $res['ok']) {
            return response()->json([
                'message' => $res['message'] ?? 'ERP billing unavailable',
                'source' => $res['source'],
            ], $res['status'] >= 400 ? $res['status'] : 502);
        }

        $gateways = array_values(array_filter(
            $res['data']['gateways'] ?? [],
            fn ($row) => is_array($row) && ! empty($row['enabled']) && ($row['id'] ?? '') !== ''
        ));

        return response()->json([
            'source' => $res['source'],
            'bills' => $res['data']['bills'] ?? [],
            'gateways' => $gateways,
            'payments' => TenantBillingPayment::query()
                ->where('tenant_id', $tenant->id)
                ->latest()
                ->limit(30)
                ->get()
                ->map(fn (TenantBillingPayment $row) => $this->present($row))
                ->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bill_id' => ['required', 'string', 'max:64'],
            'mode' => ['required', 'string', 'in:cash,installment'],
            'gateway' => ['required', 'string', 'in:zarinpal,digipay,snapppay,torobpay'],
        ]);

        $tenant = $this->tenant($request);
        $listed = $this->erp->outstanding($tenant);
        if (! $listed['ok']) {
            return response()->json([
                'message' => $listed['message'] ?? 'ERP billing unavailable',
            ], $listed['status'] >= 400 ? $listed['status'] : 502);
        }

        $bill = collect($listed['data']['bills'] ?? [])->firstWhere('id', $data['bill_id']);
        $gateway = collect($listed['data']['gateways'] ?? [])->firstWhere('id', $data['gateway']);
        if (! is_array($bill)) {
            return response()->json(['message' => 'Bill not found'], 404);
        }
        if (! is_array($gateway) || empty($gateway['enabled'])) {
            return response()->json(['message' => 'Gateway is not enabled'], 422);
        }
        $modes = array_map('strval', (array) ($gateway['modes'] ?? []));
        if (! in_array($data['mode'], $modes, true)) {
            return response()->json(['message' => 'Gateway does not support this mode'], 422);
        }

        $base = (int) ($bill['amount_minor'] ?? 0);
        $percent = round((float) ($gateway['fee_percent'] ?? 0), 2);
        $fee = (int) round($base * $percent / 100);
        $row = TenantBillingPayment::query()->create([
            'tenant_id' => $tenant->id,
            'bill_id' => $data['bill_id'],
            'bill_kind' => isset($bill['kind']) ? (string) $bill['kind'] : null,
            'bill_title' => isset($bill['title']) ? (string) $bill['title'] : null,
            'gateway' => $data['gateway'],
            'mode' => $data['mode'],
            'base_minor' => $base,
            'fee_percent' => $percent,
            'fee_minor' => $fee,
            'total_minor' => $base + $fee,
            'currency' => (string) ($bill['currency'] ?? 'IRT'),
            'status' => 'pending',
        ]);
        $return = rtrim((string) config('app.frontend_url', config('app.url')), '/')
            .'/dashboard/platform-billing/return?payment='.$row->id;

        $created = $this->erp->createPayment($tenant, [
            'bill_id' => $data['bill_id'],
            'mode' => $data['mode'],
            'gateway' => $data['gateway'],
            'return_url' => $return,
        ]);
        if (! $created['ok']) {
            $row->update(['status' => 'failed']);

            return response()->json([
                'message' => $created['message'] ?? 'Payment session failed',
            ], $created['status'] >= 400 ? $created['status'] : 502);
        }

        $remote = $created['data'];
        $paymentId = (string) ($remote['payment_id'] ?? '');
        if ($paymentId === '' || ! is_string($remote['redirect_url'] ?? null) || $remote['redirect_url'] === '') {
            $row->update(['status' => 'failed']);

            return response()->json(['message' => 'ERP payment session was incomplete'], 502);
        }

        $row->fill([
            'erp_payment_id' => $paymentId,
            'base_minor' => $remote['base_minor'] ?? $row->base_minor,
            'fee_percent' => $remote['fee_percent'] ?? $row->fee_percent,
            'fee_minor' => $remote['fee_minor'] ?? $row->fee_minor,
            'total_minor' => $remote['total_minor'] ?? $row->total_minor,
            'redirect_url' => $remote['redirect_url'],
            'status' => 'pending',
        ])->save();

        return response()->json(['payment' => $this->present($row->fresh() ?? $row)], 201);
    }

    public function show(Request $request, int $payment): JsonResponse
    {
        $tenant = $this->tenant($request);
        $row = TenantBillingPayment::query()
            ->where('tenant_id', $tenant->id)
            ->whereKey($payment)
            ->firstOrFail();

        if ($row->status !== 'paid' && filled($row->erp_payment_id)) {
            $remote = $this->erp->payment($tenant, (string) $row->erp_payment_id);
            if ($remote['ok']) {
                $status = (string) ($remote['data']['status'] ?? 'pending');
                if (in_array($status, ['pending', 'paid', 'failed'], true) && $status !== $row->status) {
                    $row->status = $status;
                    $row->save();
                }
            }
        }

        return response()->json(['payment' => $this->present($row->fresh() ?? $row)]);
    }

    protected function tenant(Request $request): Tenant
    {
        return Tenant::query()->findOrFail($request->user()->tenant_id);
    }

    /** @return array<string, mixed> */
    protected function present(TenantBillingPayment $row): array
    {
        return [
            'id' => $row->id,
            'payment_id' => $row->erp_payment_id,
            'bill_id' => $row->bill_id,
            'bill_kind' => $row->bill_kind,
            'bill_title' => $row->bill_title,
            'gateway' => $row->gateway,
            'mode' => $row->mode,
            'base_minor' => (int) $row->base_minor,
            'fee_percent' => (float) $row->fee_percent,
            'fee_minor' => (int) $row->fee_minor,
            'total_minor' => (int) $row->total_minor,
            'currency' => $row->currency,
            'status' => $row->status,
            'redirect_url' => $row->redirect_url,
            'created_at' => optional($row->created_at)->toIso8601String(),
        ];
    }
}
