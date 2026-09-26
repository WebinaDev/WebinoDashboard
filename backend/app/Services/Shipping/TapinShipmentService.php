<?php

namespace App\Services\Shipping;

use App\Models\Order;

/**
 * Register / track Tapin shipments on orders (meta.tapin).
 */
class TapinShipmentService
{
    public function __construct(protected TapinClient $tapin) {}

    /**
     * Live quote for a Tapin shipping method at checkout.
     *
     * @return int|null cost in minor units (IRR toman-style as stored), null if unavailable
     */
    public function quoteCost(int $tenantId, array $context): ?int
    {
        if (! $this->tapin->isReady($tenantId)) {
            return null;
        }
        $settings = $this->tapin->getRaw($tenantId);
        $payload = [
            'shop_id' => $settings['shop_id'],
            'address' => [
                'province_code' => (int) ($context['province_code'] ?? $settings['origin_province_code'] ?? 0),
                'city_code' => (int) ($context['city_code'] ?? 0),
            ],
            'package' => [
                'weight' => max(100, (int) ($context['weight_g'] ?? 500)),
                'box_id' => (int) ($settings['default_box_id'] ?? 1),
            ],
            'service' => (string) ($context['service'] ?? 'pishtaz'),
        ];
        $res = $this->tapin->checkPrice($tenantId, $payload);
        if (! $res['ok'] || ! is_array($res['entries'])) {
            return null;
        }
        $price = $res['entries']['price']
            ?? $res['entries']['total_price']
            ?? $res['entries']['amount']
            ?? null;
        if (! is_numeric($price)) {
            return null;
        }
        $cost = (int) round((float) $price);
        $pct = (float) ($settings['rate_extra_percent'] ?? 0);
        $fixed = (int) ($settings['rate_extra_fixed'] ?? 0);
        if ($pct !== 0.0) {
            $cost = (int) round($cost * (1 + $pct / 100));
        }
        $cost += $fixed;
        $freeMin = (int) ($settings['free_shipping_min'] ?? 0);
        if ($freeMin > 0 && (int) ($context['cart_subtotal'] ?? 0) >= $freeMin) {
            return 0;
        }

        return max(0, $cost);
    }

    /**
     * @return array{ok: bool, message: string, tapin: array<string, mixed>|null}
     */
    public function register(Order $order, ?string $service = null): array
    {
        $tenantId = (int) $order->tenant_id;
        if (! $this->tapin->isReady($tenantId)) {
            return ['ok' => false, 'message' => 'Tapin is not configured', 'tapin' => null];
        }

        $meta = is_array($order->meta) ? $order->meta : [];
        if (! empty($meta['tapin']['barcode']) || ! empty($meta['tapin']['order_id'])) {
            return ['ok' => true, 'message' => 'Already registered', 'tapin' => $meta['tapin']];
        }

        $settings = $this->tapin->getRaw($tenantId);
        $addr = $this->normalizeAddress($order->shipping_address);
        $phone = (string) ($order->customer_phone ?: ($addr['phone'] ?? ''));
        $name = (string) ($order->customer_name ?: ($addr['name'] ?? 'Customer'));

        $weight = 0;
        foreach ($order->items ?? [] as $item) {
            $weight += max(100, (int) ($item->quantity ?? 1) * 200);
        }
        if ($weight <= 0) {
            $weight = 500;
        }

        $payload = [
            'shop_id' => $settings['shop_id'],
            'address' => [
                'first_name' => $name,
                'last_name' => '',
                'phone' => $phone,
                'postal_code' => (string) ($addr['postcode'] ?? ''),
                'address' => (string) ($addr['address'] ?? $order->shipping_address ?? ''),
                'province_code' => (int) ($addr['province_code'] ?? $settings['origin_province_code'] ?? 0),
                'city_code' => (int) ($addr['city_code'] ?? 0),
            ],
            'package' => [
                'weight' => $weight,
                'box_id' => (int) ($settings['default_box_id'] ?? 1),
                'content_type' => (int) ($settings['content_type'] ?? 1),
            ],
            'service' => $service ?: 'pishtaz',
            'pay_type' => (int) ($settings['default_pay_type'] ?? 1),
            'order_type' => (int) ($settings['default_order_type'] ?? 0),
            'register_type' => (int) ($settings['register_type'] ?? 1),
            'has_insurance' => ! empty($settings['has_insurance']),
            'employee_code' => (int) ($settings['employee_code'] ?? -1),
            'reference' => (string) ($order->number ?: $order->id),
        ];

        $res = $this->tapin->registerOrder($tenantId, $payload);
        if (! $res['ok']) {
            return ['ok' => false, 'message' => $res['message'] ?: 'Register failed', 'tapin' => null];
        }

        $entries = is_array($res['entries']) ? $res['entries'] : [];
        $tapinMeta = [
            'order_id' => $entries['order_id'] ?? $entries['id'] ?? null,
            'barcode' => $entries['barcode'] ?? $entries['bar_code'] ?? null,
            'tracking_url' => $entries['tracking_url'] ?? $entries['track_url'] ?? null,
            'status' => $entries['status'] ?? $entries['status_title'] ?? 'registered',
            'service' => $payload['service'],
            'registered_at' => now()->toIso8601String(),
            'raw' => $entries,
        ];
        if (empty($tapinMeta['tracking_url']) && ! empty($tapinMeta['barcode'])) {
            $tapinMeta['tracking_url'] = 'https://tapin.ir/tracking/'.urlencode((string) $tapinMeta['barcode']);
        }

        $meta['tapin'] = $tapinMeta;
        $meta['shipping_method'] = 'tapin';
        $order->meta = $meta;
        $order->save();

        return ['ok' => true, 'message' => 'Registered', 'tapin' => $tapinMeta];
    }

    /**
     * @return array{ok: bool, message: string, tapin: array<string, mixed>|null}
     */
    public function refreshStatus(Order $order): array
    {
        $tenantId = (int) $order->tenant_id;
        $meta = is_array($order->meta) ? $order->meta : [];
        $tapin = is_array($meta['tapin'] ?? null) ? $meta['tapin'] : [];
        if (empty($tapin['order_id']) && empty($tapin['barcode'])) {
            return ['ok' => false, 'message' => 'No Tapin shipment on order', 'tapin' => null];
        }

        $payload = array_filter([
            'order_id' => $tapin['order_id'] ?? null,
            'barcode' => $tapin['barcode'] ?? null,
            'shop_id' => $this->tapin->getRaw($tenantId)['shop_id'] ?? null,
        ]);
        $res = $this->tapin->orderDetail($tenantId, $payload);
        if (! $res['ok']) {
            return ['ok' => false, 'message' => $res['message'] ?: 'Status failed', 'tapin' => $tapin];
        }
        $entries = is_array($res['entries']) ? $res['entries'] : [];
        $tapin['status'] = $entries['status'] ?? $entries['status_title'] ?? $tapin['status'] ?? null;
        $tapin['barcode'] = $entries['barcode'] ?? $entries['bar_code'] ?? $tapin['barcode'] ?? null;
        $tapin['tracking_url'] = $entries['tracking_url'] ?? $tapin['tracking_url'] ?? null;
        $tapin['detail'] = $entries;
        $tapin['checked_at'] = now()->toIso8601String();
        $meta['tapin'] = $tapin;
        $order->meta = $meta;
        $order->save();

        return ['ok' => true, 'message' => 'Updated', 'tapin' => $tapin];
    }

    /**
     * @return array{ok: bool, message: string, html: string|null}
     */
    public function label(Order $order): array
    {
        $tenantId = (int) $order->tenant_id;
        $meta = is_array($order->meta) ? $order->meta : [];
        $tapin = is_array($meta['tapin'] ?? null) ? $meta['tapin'] : [];
        if (empty($tapin['order_id']) && empty($tapin['barcode'])) {
            return ['ok' => false, 'message' => 'No Tapin shipment on order', 'html' => null];
        }
        $payload = array_filter([
            'order_id' => $tapin['order_id'] ?? null,
            'barcode' => $tapin['barcode'] ?? null,
            'shop_id' => $this->tapin->getRaw($tenantId)['shop_id'] ?? null,
        ]);
        $res = $this->tapin->labelHtml($tenantId, $payload);
        if (! $res['ok']) {
            return ['ok' => false, 'message' => $res['message'] ?: 'Label failed', 'html' => null];
        }
        $html = null;
        if (is_array($res['entries'])) {
            $html = $res['entries']['html'] ?? $res['entries']['label'] ?? null;
            if (is_array($html)) {
                $html = json_encode($html, JSON_UNESCAPED_UNICODE);
            }
        }

        return ['ok' => true, 'message' => '', 'html' => is_string($html) ? $html : null];
    }

    /**
     * @return array{name?: string, phone?: string, address?: string, postcode?: string, city_code?: int, province_code?: int}
     */
    protected function normalizeAddress(mixed $addr): array
    {
        if (is_string($addr)) {
            return ['address' => $addr];
        }
        if (! is_array($addr)) {
            return [];
        }

        return [
            'name' => (string) ($addr['name'] ?? ''),
            'phone' => (string) ($addr['phone'] ?? ''),
            'address' => (string) ($addr['address_1'] ?? $addr['address'] ?? ''),
            'postcode' => (string) ($addr['postcode'] ?? $addr['postal_code'] ?? ''),
            'city_code' => (int) ($addr['city_code'] ?? 0),
            'province_code' => (int) ($addr['province_code'] ?? 0),
        ];
    }
}
