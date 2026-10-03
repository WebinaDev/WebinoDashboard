<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Payments\PaymentCheckoutService;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Http\Request;

class PublicOrderPaymentController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findPayLinkOrder($request, $order);
        $this->assertPayToken($request, $row);

        return response()->json([
            'data' => [
                'id' => $row->id,
                'number' => $row->number,
                'status' => $row->status,
                'total_minor' => $row->total_minor,
                'subtotal_minor' => $row->subtotal_minor,
                'discount_minor' => $row->discount_minor,
                'shipping_minor' => $row->shipping_minor,
                'tax_minor' => (int) ($row->tax_minor ?? 0),
                'currency' => $row->currency,
                'customer_name' => $row->customer_name,
                'shipping_address' => $row->shipping_address,
                'items' => $row->items->map(fn ($it) => [
                    'product_name' => $it->product_name,
                    'quantity' => $it->quantity,
                    'unit_price_minor' => $it->unit_price_minor,
                ])->values()->all(),
                'gateways' => $this->resolveGateways($row),
                'purchase_type' => (string) ($row->meta['wfcp_purchase_type'] ?? 'cash'),
                'allow_both_types' => (bool) ($row->meta['allow_both_purchase_types'] ?? $row->meta['allow_both_types'] ?? false),
            ],
        ]);
    }

    public function intent(Request $request, int $order, PaymentCheckoutService $checkout): \Illuminate\Http\JsonResponse
    {
        $row = $this->findPayLinkOrder($request, $order);
        $this->assertPayToken($request, $row);

        $data = $request->validate([
            'provider' => ['required', 'string', 'max:32'],
            'token' => ['nullable', 'string', 'max:64'],
            'mode' => ['nullable', 'string', 'in:cash,installment'],
        ]);

        $provider = str_replace('-', '_', strtolower($data['provider']));
        $allowedIds = array_column($this->resolveGateways($row), 'id');
        if ($allowedIds !== [] && ! in_array($provider, $allowedIds, true)) {
            return response()->json(['message' => 'Gateway not allowed for this order.'], 422);
        }

        if (! in_array($provider, ['zarinpal', 'digipay', 'snapppay', 'torobpay', 'bale_pay', 'basalam_pay'], true)) {
            return response()->json(['message' => 'Online payment is not available for this gateway.'], 422);
        }

        try {
            $intent = $checkout->createIntent($row, $provider, $data['mode'] ?? null);
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        $meta = is_array($intent->meta) ? $intent->meta : [];

        return response()->json([
            'data' => [
                'redirect_url' => $intent->redirect_url,
                'provider' => $intent->provider,
                'mode' => $meta['mode'] ?? null,
                'fee_percent' => $meta['fee_percent'] ?? 0,
                'fee_payer' => $meta['fee_payer'] ?? 'merchant',
                'fee_minor' => $meta['fee_minor'] ?? 0,
                'base_minor' => $meta['base_minor'] ?? null,
                'charge_minor' => $meta['charge_minor'] ?? null,
            ],
        ]);
    }

    protected function findPayLinkOrder(Request $request, int $order): Order
    {
        $tid = $this->publicTenantId($request);
        $row = Order::query()->where('tenant_id', $tid)->whereKey($order)->firstOrFail();
        abort_unless($row->is_pay_link, 404);

        return $row->load(['items']);
    }

    protected function assertPayToken(Request $request, Order $order): void
    {
        $token = (string) ($request->query('token', $request->input('token', '')));
        $expected = (string) ($order->meta['pay_token'] ?? $order->meta['pay_link_token'] ?? '');
        if ($expected === '' && is_string($order->payment_url) && $order->payment_url !== '') {
            $query = parse_url($order->payment_url, PHP_URL_QUERY);
            if (is_string($query)) {
                parse_str($query, $parts);
                $expected = (string) ($parts['token'] ?? '');
            }
        }
        if ($expected === '' || ! hash_equals($expected, $token)) {
            abort(403, 'Invalid payment link.');
        }
    }

    /** @return list<array{id: string, label: string}> */
    protected function resolveGateways(Order $order): array
    {
        $catalog = $this->gatewayCatalog();
        $tid = (int) $order->tenant_id;
        $settings = app(PaymentGatewaySettingsService::class);
        $allowedMeta = $order->meta['allowed_gateways'] ?? null;
        $filterIds = null;
        if (is_array($allowedMeta) && count($allowedMeta) > 0) {
            $filterIds = array_map(
                fn ($x) => str_replace('-', '_', strtolower((string) $x)),
                $allowedMeta
            );
        }

        $purchase = (string) ($order->meta['wfcp_purchase_type'] ?? 'cash');
        $mode = $purchase === 'installment' ? 'installment' : 'cash';
        $allowBoth = (bool) ($order->meta['allow_both_purchase_types'] ?? $order->meta['allow_both_types'] ?? false);

        $out = [];
        foreach ($catalog as $gw) {
            $id = (string) $gw['id'];
            if ($filterIds !== null && ! in_array($id, $filterIds, true)) {
                continue;
            }
            if (in_array($id, PaymentGatewaySettingsService::COMMERCE_GATEWAYS, true)) {
                if (! $settings->isEnabled($tid, $id) || ! $settings->configured($tid, $id)) {
                    continue;
                }
                $raw = $settings->getRaw($tid, $id);
                $cash = (bool) ($raw['cash_enabled'] ?? false);
                $installment = (bool) ($raw['installment_enabled'] ?? false);
                if (! $allowBoth && ! $settings->supportsMode($raw, $mode)) {
                    continue;
                }
                if ($allowBoth && ! $cash && ! $installment) {
                    continue;
                }
                $quote = $settings->feeQuote($raw, (int) $order->total_minor);
                $out[] = array_merge($gw, [
                    'label' => (string) ($raw['title'] ?? ($id === 'digipay' ? ($raw['title_ipg'] ?? $gw['label']) : $gw['label'])),
                    'cash_enabled' => $cash,
                    'installment_enabled' => $installment,
                    'fee_percent' => $quote['fee_percent'],
                    'fee_payer' => $quote['fee_payer'],
                    'fee_minor' => $quote['fee_minor'],
                    'base_minor' => $quote['base_minor'],
                    'charge_minor' => $quote['charge_minor'],
                ]);

                continue;
            }
            if (in_array($id, ['card_to_card', 'wallet', 'cod'], true)) {
                $out[] = $gw;

                continue;
            }
            if (! $settings->isEnabled($tid, $id)) {
                continue;
            }
            if ($id === 'bale_pay' || $settings->configured($tid, $id)) {
                $out[] = $gw;
            }
        }

        return $out;
    }

    /** @return list<array{id: string, label: string}> */
    protected function gatewayCatalog(): array
    {
        return [
            ['id' => 'zarinpal', 'label' => 'Zarinpal'],
            ['id' => 'digipay', 'label' => 'Digipay'],
            ['id' => 'snapppay', 'label' => 'SnappPay'],
            ['id' => 'torobpay', 'label' => 'TorobPay'],
            ['id' => 'card_to_card', 'label' => 'Card to card'],
            ['id' => 'wallet', 'label' => 'Wallet'],
            ['id' => 'cod', 'label' => 'Cash on delivery'],
            ['id' => 'bale_pay', 'label' => 'Bale Pay'],
            ['id' => 'basalam_pay', 'label' => 'Basalam Pay'],
        ];
    }
}
