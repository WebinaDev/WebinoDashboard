<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\Orders\PosSettings;
use App\Services\Payments\PaymentCheckoutService;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class PublicOrderPaymentController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findPayLinkOrder($request, $order);
        $this->assertPayToken($request, $row);
        $fields = app(PosSettings::class)->get((int) $row->tenant_id)['pay_link_fields'] ?? [];
        $addr = is_array($row->shipping_address) ? $row->shipping_address : [];
        $state = (string) ($addr['province_code'] ?? $addr['state'] ?? '');
        $postcode = (string) ($addr['postcode'] ?? '');
        $shippingOptions = [];
        try {
            $quote = app(ShippingZonesService::class)->quote(
                (int) $row->tenant_id,
                $state !== '' ? (str_starts_with($state, 'IR:') ? $state : 'IR:'.$state) : null,
                $postcode !== '' ? $postcode : null,
                (int) $row->subtotal_minor,
                isset($addr['city']) ? (string) $addr['city'] : null,
            );
            foreach (is_array($quote) ? $quote : [] as $rate) {
                if (! is_array($rate)) {
                    continue;
                }
                $shippingOptions[] = [
                    'id' => (string) ($rate['instance_id'] ?? $rate['method_id'] ?? $rate['id'] ?? ''),
                    'title' => (string) ($rate['title'] ?? $rate['label'] ?? ''),
                    'cost_minor' => (int) ($rate['cost_minor'] ?? $rate['cost'] ?? 0),
                    'method_id' => (string) ($rate['method_id'] ?? ''),
                    'instance_id' => (int) ($rate['instance_id'] ?? 0),
                ];
            }
        } catch (\Throwable) {
            $shippingOptions = [];
        }

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
                'show_vat' => \App\Services\Orders\OrderTax::showOnInvoice((int) $row->tenant_id),
                'currency' => $row->currency,
                'customer_name' => $row->customer_name,
                'customer_phone' => $row->customer_phone,
                'customer_email' => $row->customer_email,
                'shipping_address' => $row->shipping_address,
                'items' => $row->items->map(fn ($it) => [
                    'id' => $it->id,
                    'product_name' => $it->product_name,
                    'quantity' => $it->quantity,
                    'unit_price_minor' => $it->unit_price_minor,
                ])->values()->all(),
                'gateways' => $this->resolveGateways($row),
                'purchase_type' => (string) ($row->meta['wfcp_purchase_type'] ?? 'cash'),
                'allow_both_types' => (bool) ($row->meta['allow_both_purchase_types'] ?? $row->meta['allow_both_types'] ?? false),
                'fields' => $fields,
                'shipping_options' => $shippingOptions,
                'wizard_steps' => ['products', 'address', 'pay'],
                'needs_payment' => in_array((string) $row->status, ['pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed'], true),
            ],
        ]);
    }

    /**
     * Customer wizard confirm: update product qty and/or address+shipping before paying.
     */
    public function confirm(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findPayLinkOrder($request, $order);
        $this->assertPayToken($request, $row);

        if (! in_array((string) $row->status, ['pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed'], true)) {
            return response()->json(['message' => 'Order can no longer be edited.'], 409);
        }

        $data = $request->validate([
            'token' => ['nullable', 'string', 'max:64'],
            'step' => ['nullable', 'string', 'in:products,address,pay'],
            'items' => ['nullable', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:0', 'max:999'],
            'shipping_address' => ['nullable', 'array'],
            'shipping_minor' => ['nullable', 'integer', 'min:0'],
            'shipping_method_id' => ['nullable', 'string', 'max:64'],
            'shipping_title' => ['nullable', 'string', 'max:255'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_email' => ['nullable', 'email', 'max:255'],
        ]);

        $fields = app(PosSettings::class)->get((int) $row->tenant_id)['pay_link_fields'] ?? [];

        DB::transaction(function () use ($row, $data, $fields) {
            $locked = Order::query()->whereKey($row->id)->lockForUpdate()->firstOrFail();

            if (! empty($data['items']) && ! empty($fields['qty_edit']['customer_editable'] ?? true)) {
                $subtotal = 0;
                foreach ($data['items'] as $line) {
                    $item = OrderItem::query()
                        ->where('order_id', $locked->id)
                        ->whereKey((int) $line['id'])
                        ->first();
                    if (! $item) {
                        continue;
                    }
                    $qty = (int) $line['quantity'];
                    if ($qty <= 0) {
                        $item->delete();

                        continue;
                    }
                    $item->update(['quantity' => $qty]);
                    $subtotal += $qty * (int) $item->unit_price_minor;
                }
                if ($subtotal <= 0) {
                    abort(422, 'At least one item is required.');
                }
                $discount = (int) $locked->discount_minor;
                $shipping = (int) ($data['shipping_minor'] ?? $locked->shipping_minor);
                $locked->update([
                    'subtotal_minor' => $subtotal,
                    'shipping_minor' => $shipping,
                    'total_minor' => max(0, $subtotal - $discount + $shipping),
                ]);
            }

            $patch = [];
            if (array_key_exists('shipping_address', $data) && is_array($data['shipping_address'])) {
                $patch['shipping_address'] = $data['shipping_address'];
            }
            if (array_key_exists('customer_name', $data) && ($fields['customer_name']['customer_editable'] ?? true)) {
                $patch['customer_name'] = $data['customer_name'];
            }
            if (array_key_exists('customer_email', $data) && ($fields['customer_email']['customer_editable'] ?? true)) {
                $patch['customer_email'] = $data['customer_email'];
            }
            if (array_key_exists('shipping_minor', $data)) {
                $subtotal = (int) $locked->fresh()->subtotal_minor;
                $discount = (int) $locked->discount_minor;
                $shipping = (int) $data['shipping_minor'];
                $patch['shipping_minor'] = $shipping;
                $patch['total_minor'] = max(0, $subtotal - $discount + $shipping);
            }
            if ($patch !== []) {
                $meta = is_array($locked->meta) ? $locked->meta : [];
                if (! empty($data['shipping_method_id'])) {
                    $meta['shipping_method_id'] = $data['shipping_method_id'];
                }
                if (! empty($data['shipping_title'])) {
                    $meta['shipping_title'] = $data['shipping_title'];
                }
                $patch['meta'] = $meta;
                $locked->update($patch);
            }
        });

        $fresh = $row->fresh()->load(['items']);

        return response()->json([
            'data' => [
                'id' => $fresh->id,
                'total_minor' => $fresh->total_minor,
                'subtotal_minor' => $fresh->subtotal_minor,
                'shipping_minor' => $fresh->shipping_minor,
                'discount_minor' => $fresh->discount_minor,
                'customer_name' => $fresh->customer_name,
                'shipping_address' => $fresh->shipping_address,
                'items' => $fresh->items->map(fn ($it) => [
                    'id' => $it->id,
                    'product_name' => $it->product_name,
                    'quantity' => $it->quantity,
                    'unit_price_minor' => $it->unit_price_minor,
                ])->values()->all(),
                'gateways' => $this->resolveGateways($fresh),
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
            'confirm_offline' => ['nullable', 'boolean'],
            'customer_note' => ['nullable', 'string', 'max:1000'],
            'receipt_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $provider = str_replace('-', '_', strtolower($data['provider']));
        if ($provider === 'c2c') {
            $provider = 'card_to_card';
        }
        $gateways = $this->resolveGateways($row);
        $allowedIds = array_column($gateways, 'id');
        if ($allowedIds !== [] && ! in_array($provider, $allowedIds, true)) {
            return response()->json(['message' => 'Gateway not allowed for this order.'], 422);
        }

        $offlineIds = ['card_to_card', 'wallet', 'cod', 'cash', 'other'];
        if (in_array($provider, $offlineIds, true)) {
            if (empty($data['confirm_offline'])) {
                $match = collect($gateways)->firstWhere('id', $provider) ?? [];

                return response()->json([
                    'data' => [
                        'offline' => true,
                        'provider' => $provider,
                        'redirect_url' => null,
                        'instructions' => (string) ($match['instructions'] ?? ''),
                        'iban' => $match['iban'] ?? null,
                        'cards' => $match['cards'] ?? [],
                        'deadline_hours' => $match['deadline_hours'] ?? null,
                    ],
                ]);
            }

            $status = (string) $row->status;
            if (! in_array($status, ['pending_payment', 'awaiting_gateway', 'on_hold', 'payment_failed'], true)) {
                return response()->json(['message' => 'Order can no longer be paid.'], 409);
            }

            $statuses = app(\App\Services\Orders\OrderStatusService::class);
            if ($status === 'payment_failed') {
                if (! $statuses->apply($row, 'pending_payment')) {
                    return response()->json(['message' => 'Could not reopen this order for payment.'], 422);
                }
                $row->refresh();
            }

            $meta = is_array($row->meta) ? $row->meta : [];
            $receiptUrl = trim((string) ($data['receipt_url'] ?? ''));
            $meta['offline_payment'] = [
                'provider' => $provider,
                'confirmed_at' => now()->toIso8601String(),
                'customer_note' => trim((string) ($data['customer_note'] ?? '')),
                'receipt_url' => $receiptUrl !== '' ? $receiptUrl : null,
            ];
            $patch = [
                'payment_provider' => $provider,
                'payment_tender' => $provider === 'cod' ? 'other' : $provider,
                'meta' => $meta,
            ];
            if ($receiptUrl !== '') {
                $patch['c2c_receipt_url'] = $receiptUrl;
                $patch['c2c_status'] = 'pending';
            } elseif ($provider === 'card_to_card') {
                $patch['c2c_status'] = 'pending';
            }
            $applied = $statuses->apply($row, 'on_hold', $patch);
            if (! $applied) {
                return response()->json(['message' => 'Could not confirm offline payment for this order.'], 422);
            }

            $match = collect($gateways)->firstWhere('id', $provider) ?? [];

            return response()->json([
                'data' => [
                    'offline' => true,
                    'confirmed' => true,
                    'provider' => $provider,
                    'redirect_url' => null,
                    'status' => 'on_hold',
                    'instructions' => (string) ($match['instructions'] ?? ''),
                ],
            ]);
        }

        $live = app(PaymentGatewaySettingsService::class)->liveCommerceGatewayIds();
        $payable = array_values(array_unique(array_merge($live, ['bale_pay', 'basalam_pay'])));
        if (! in_array($provider, $payable, true)) {
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
        $baleInvoice = null;
        if ($intent->provider === 'bale_pay' && $request->boolean('bale_miniapp')) {
            try {
                $baleInvoice = app(\App\Services\Payments\BalePayService::class)->invoiceLink($row->fresh() ?? $row, $intent);
            } catch (\Throwable) {
                $baleInvoice = null;
            }
        }

        return response()->json([
            'data' => [
                'redirect_url' => $intent->redirect_url,
                'bale_invoice' => $baleInvoice,
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

    /** Customer uploads a payment receipt image/PDF for offline pay-link confirmation. */
    public function uploadReceipt(Request $request, int $order): \Illuminate\Http\JsonResponse
    {
        $row = $this->findPayLinkOrder($request, $order);
        $this->assertPayToken($request, $row);

        $request->validate([
            'token' => ['nullable', 'string', 'max:64'],
            'file' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $tid = (int) $row->tenant_id;
        $path = $request->file('file')->store("pay-receipts/{$tid}/{$row->id}", 'public');
        abort_unless(is_string($path) && $path !== '', 500, 'Upload failed.');
        $url = Storage::disk('public')->url($path);

        $meta = is_array($row->meta) ? $row->meta : [];
        $meta['pay_link_receipt'] = [
            'url' => $url,
            'path' => $path,
            'uploaded_at' => now()->toIso8601String(),
            'original_name' => $request->file('file')->getClientOriginalName(),
        ];
        $row->update([
            'meta' => $meta,
            'c2c_receipt_url' => $url,
        ]);

        return response()->json([
            'data' => [
                'receipt_url' => $url,
                'order_id' => $row->id,
            ],
        ], 201);
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
            if (in_array($id, $settings->liveCommerceGatewayIds(), true)) {
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
                $hubId = $id === 'card_to_card' ? 'c2c' : $id;
                if ($hubId !== 'cod' && ! $settings->isEnabled($tid, $hubId)) {
                    continue;
                }
                $out[] = array_merge($gw, $this->offlineGatewayExtras($tid, $id, $settings));

                continue;
            }
            if (! $settings->isEnabled($tid, $id)) {
                continue;
            }
            if ($id === 'cheque') {
                $out[] = $gw;

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
        $catalog = app(\App\Services\Payments\PaymentGatewayCatalog::class);
        $out = [];
        foreach ($catalog->liveCommerceIds() as $id) {
            $meta = $catalog->get($id);
            $out[] = [
                'id' => $id,
                'label' => (string) ($meta['label_en'] ?? $meta['label_fa'] ?? $id),
            ];
        }
        $out[] = ['id' => 'card_to_card', 'label' => 'Card to card'];
        $out[] = ['id' => 'wallet', 'label' => 'Wallet'];
        $out[] = ['id' => 'cod', 'label' => 'Cash on delivery'];
        $out[] = ['id' => 'bale_pay', 'label' => 'Bale Pay'];
        $out[] = ['id' => 'basalam_pay', 'label' => 'Basalam Pay'];

        return $out;
    }

    /**
     * @return array{offline: bool, instructions: string, iban?: string|null, cards?: list<mixed>, deadline_hours?: int|null, label?: string}
     */
    protected function offlineGatewayExtras(int $tenantId, string $id, PaymentGatewaySettingsService $settings): array
    {
        $pos = app(PosSettings::class);
        $posText = $pos->offlineInstructionsFor($tenantId, $id);
        $hubId = $id === 'card_to_card' ? 'c2c' : $id;
        $raw = [];
        try {
            $raw = $settings->getRaw($tenantId, $hubId);
        } catch (\Throwable) {
            $raw = [];
        }
        if (! is_array($raw)) {
            $raw = [];
        }
        $hubText = trim((string) ($raw['instructions'] ?? $raw['description'] ?? ''));
        $instructions = $posText !== '' ? $posText : $hubText;
        $label = trim((string) ($raw['title'] ?? ''));
        $extras = [
            'offline' => true,
            'instructions' => $instructions,
        ];
        if ($label !== '') {
            $extras['label'] = $label;
        }
        if ($id === 'card_to_card') {
            $extras['iban'] = isset($raw['iban']) ? (string) $raw['iban'] : null;
            $extras['cards'] = is_array($raw['cards'] ?? null) ? array_values($raw['cards']) : [];
            $extras['deadline_hours'] = isset($raw['deadline_h'])
                ? (int) $raw['deadline_h']
                : (isset($raw['deadline_hours']) ? (int) $raw['deadline_hours'] : null);
        }

        return $extras;
    }
}
