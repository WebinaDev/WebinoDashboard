<?php

namespace App\Services\Marketplace;

/**
 * Normalizes marketplace order payloads into one shape (port of WNC_Order_Normalizer).
 * Item prices are returned in the platform's remote unit; callers convert to store currency.
 */
final class OrderNormalizer
{
    /**
     * @param  array<string, mixed>  $raw
     * @return array{id: string, status: string, items: list<array<string, mixed>>, customer: array<string, string>, raw: array<string, mixed>}
     */
    public static function normalize(string $platform, array $raw): array
    {
        return match ($platform) {
            'digikala' => self::digikala($raw),
            'basalam' => self::basalam($raw),
            'snappshop' => self::snappshop($raw),
            'tapsishop' => self::tapsishop($raw),
            default => self::generic($raw),
        };
    }

    /** Substring-based status mapping shared by most platforms (WNC_Order_Sync::map_remote_status). */
    public static function genericStatus(string $remote): string
    {
        $r = mb_strtolower(trim($remote));
        if ($r === '') {
            return 'processing';
        }
        $map = [
            'cancel' => 'cancelled',
            'refund' => 'refunded',
            'return' => 'refunded',
            'complete' => 'completed',
            'deliver' => 'completed',
            'ship' => 'shipped',
            'fulfill' => 'completed',
            'pending' => 'pending_payment',
            'wait' => 'on_hold',
            'hold' => 'on_hold',
            'payment' => 'pending_payment',
            'new' => 'processing',
            'confirm' => 'processing',
            'process' => 'processing',
            'accept' => 'processing',
        ];
        foreach ($map as $needle => $status) {
            if (str_contains($r, $needle)) {
                return $status;
            }
        }

        return 'processing';
    }

    /** @param  array<string, mixed>  $raw */
    private static function digikala(array $raw): array
    {
        $id = (string) ($raw['id'] ?? $raw['order_item_id'] ?? $raw['order_id'] ?? '');
        $items = [];
        if (! empty($raw['items']) && is_array($raw['items'])) {
            foreach ($raw['items'] as $line) {
                if (! is_array($line)) {
                    continue;
                }
                $items[] = [
                    'product_id' => (string) ($line['product_id'] ?? ''),
                    'variant_id' => (string) ($line['variant_id'] ?? $line['id'] ?? ''),
                    'title' => (string) ($line['product_title'] ?? $line['title'] ?? ''),
                    'quantity' => max(1, (int) ($line['quantity'] ?? 1)),
                    'price' => (float) ($line['selling_price'] ?? $line['price'] ?? 0),
                ];
            }
        } else {
            $items[] = [
                'product_id' => (string) ($raw['product_id'] ?? data_get($raw, 'product.id') ?? ''),
                'variant_id' => (string) ($raw['variant_id'] ?? $raw['product_variant_id'] ?? data_get($raw, 'variant.id') ?? ''),
                'title' => (string) ($raw['product_title'] ?? $raw['title'] ?? data_get($raw, 'product.title') ?? ''),
                'quantity' => max(1, (int) ($raw['quantity'] ?? $raw['qty'] ?? 1)),
                'price' => (float) ($raw['selling_price'] ?? $raw['price'] ?? $raw['unit_price'] ?? 0),
            ];
        }
        $customer = is_array($raw['customer'] ?? null) ? $raw['customer'] : (is_array($raw['buyer'] ?? null) ? $raw['buyer'] : []);

        return [
            'id' => $id,
            'status' => self::str($raw['status'] ?? $raw['order_status'] ?? ''),
            'items' => $items,
            'customer' => self::customer($customer, $raw),
            'raw' => $raw,
        ];
    }

    /** @param  array<string, mixed>  $raw */
    private static function basalam(array $raw): array
    {
        $id = (string) ($raw['id'] ?? $raw['parcel_id'] ?? $raw['order_id'] ?? '');
        $lines = [];
        foreach (['items', 'order_items', 'products'] as $key) {
            if (! empty($raw[$key]) && is_array($raw[$key])) {
                $lines = $raw[$key];
                break;
            }
        }
        $items = [];
        foreach ($lines as $line) {
            if (! is_array($line)) {
                continue;
            }
            $variant = (string) (data_get($line, 'variation.id') ?? $line['variation_id'] ?? $line['variant_id'] ?? '');
            $items[] = [
                'product_id' => (string) ($line['product_id'] ?? data_get($line, 'product.id') ?? ''),
                'variant_id' => $variant,
                'title' => (string) ($line['title'] ?? data_get($line, 'product.title') ?? $line['name'] ?? ''),
                'quantity' => max(1, (int) ($line['quantity'] ?? $line['qty'] ?? 1)),
                'price' => (float) ($line['price'] ?? $line['primary_price'] ?? $line['paid_price'] ?? 0),
            ];
        }
        $order = is_array($raw['order'] ?? null) ? $raw['order'] : [];
        $customer = data_get($order, 'customer.recipient')
            ?? data_get($order, 'customer.user')
            ?? ($order['customer'] ?? null)
            ?? ($raw['customer'] ?? null)
            ?? ($raw['user'] ?? null)
            ?? [];

        return [
            'id' => $id,
            'status' => self::str($raw['status'] ?? $raw['parcel_status'] ?? ''),
            'items' => $items,
            'customer' => self::customer(is_array($customer) ? $customer : [], $raw),
            'raw' => $raw,
        ];
    }

    /** @param  array<string, mixed>  $raw */
    private static function snappshop(array $raw): array
    {
        $items = [];
        foreach ((array) ($raw['items'] ?? $raw['products'] ?? $raw['order_items'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $items[] = [
                'product_id' => (string) ($line['product_id'] ?? $line['id'] ?? ''),
                'variant_id' => (string) ($line['variant_id'] ?? $line['sku'] ?? ''),
                'title' => (string) ($line['title'] ?? $line['name'] ?? ''),
                'quantity' => max(1, (int) ($line['quantity'] ?? $line['qty'] ?? 1)),
                'price' => (float) ($line['price'] ?? $line['selling_price'] ?? 0),
            ];
        }

        return [
            'id' => (string) ($raw['id'] ?? $raw['order_id'] ?? $raw['code'] ?? ''),
            'status' => self::str($raw['status'] ?? ''),
            'items' => $items,
            'customer' => self::customer((array) ($raw['customer'] ?? $raw['buyer'] ?? []), $raw),
            'raw' => $raw,
        ];
    }

    /** @param  array<string, mixed>  $raw */
    private static function tapsishop(array $raw): array
    {
        $items = [];
        foreach ((array) ($raw['items'] ?? $raw['orderItems'] ?? $raw['products'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $items[] = [
                'product_id' => (string) ($line['productId'] ?? $line['sourceSimpleProductId'] ?? $line['id'] ?? ''),
                'variant_id' => (string) ($line['clientProductId'] ?? $line['variantId'] ?? ''),
                'title' => (string) ($line['title'] ?? $line['name'] ?? ''),
                'quantity' => max(1, (int) ($line['quantity'] ?? $line['onHandQty'] ?? $line['qty'] ?? 1)),
                'price' => (float) ($line['finalPrice'] ?? $line['price'] ?? $line['originalPrice'] ?? 0),
            ];
        }

        return [
            'id' => (string) ($raw['id'] ?? $raw['orderId'] ?? $raw['code'] ?? ''),
            'status' => self::str($raw['status'] ?? $raw['orderStatus'] ?? ''),
            'items' => $items,
            'customer' => self::customer((array) ($raw['customer'] ?? $raw['user'] ?? []), $raw),
            'raw' => $raw,
        ];
    }

    /** @param  array<string, mixed>  $raw */
    private static function generic(array $raw): array
    {
        $items = [];
        foreach ((array) ($raw['items'] ?? $raw['order_items'] ?? $raw['variants'] ?? []) as $line) {
            if (! is_array($line)) {
                continue;
            }
            $items[] = [
                'product_id' => (string) ($line['product_id'] ?? ''),
                'variant_id' => (string) ($line['variant_id'] ?? $line['id'] ?? ''),
                'title' => (string) ($line['title'] ?? $line['name'] ?? ''),
                'quantity' => max(1, (int) ($line['quantity'] ?? $line['qty'] ?? 1)),
                'price' => (float) ($line['price'] ?? $line['selling_price'] ?? 0),
            ];
        }

        return [
            'id' => (string) ($raw['id'] ?? $raw['order_id'] ?? ''),
            'status' => self::str($raw['status'] ?? ''),
            'items' => $items,
            'customer' => self::customer((array) ($raw['customer'] ?? []), $raw),
            'raw' => $raw,
        ];
    }

    private static function str(mixed $v): string
    {
        if (is_array($v)) {
            return (string) ($v['title'] ?? $v['name'] ?? $v['id'] ?? '');
        }

        return (string) $v;
    }

    /**
     * @param  array<string, mixed>  $customer
     * @param  array<string, mixed>  $raw
     * @return array<string, string>
     */
    public static function customer(array $customer, array $raw): array
    {
        $address = [];
        foreach (['shipping_address', 'shippingAddress', 'address', 'delivery_address', 'recipient'] as $key) {
            if (! empty($raw[$key]) && is_array($raw[$key])) {
                $address = $raw[$key];
                break;
            }
            if (! empty($customer[$key]) && is_array($customer[$key])) {
                $address = $customer[$key];
                break;
            }
        }
        $src = array_merge($customer, $address);
        $s = fn (string ...$keys) => (string) (collect($keys)->map(fn ($k) => $src[$k] ?? null)->first(fn ($v) => is_scalar($v) && $v !== '') ?? '');
        $name = $s('name', 'full_name', 'fullName');
        if ($name === '') {
            $name = trim($s('first_name', 'firstName').' '.$s('last_name', 'lastName'));
        }
        $city = $src['city'] ?? $src['city_name'] ?? '';
        $state = $src['state'] ?? $src['province'] ?? $src['state_name'] ?? '';

        return [
            'name' => $name,
            'first_name' => $s('first_name', 'firstName') ?: $name,
            'last_name' => $s('last_name', 'lastName'),
            'phone' => $s('phone', 'mobile', 'cellphone', 'mobile_number'),
            'email' => $s('email'),
            'address' => $s('address', 'address_1', 'address1', 'street', 'postal_address'),
            'city' => is_array($city) ? (string) ($city['title'] ?? $city['name'] ?? '') : (string) $city,
            'state' => is_array($state) ? (string) ($state['title'] ?? $state['name'] ?? '') : (string) $state,
            'postcode' => $s('postcode', 'postal_code', 'zip'),
            'country' => $s('country') ?: 'IR',
        ];
    }
}
