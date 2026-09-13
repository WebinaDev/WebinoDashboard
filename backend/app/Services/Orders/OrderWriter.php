<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Coupons\CouponService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderWriter
{
    public function __construct(protected CouponService $coupons) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(int $tenantId, array $data, ?User $actor = null): Order
    {
        return DB::transaction(function () use ($tenantId, $data, $actor) {
            $items = $data['items'] ?? [];
            if (! is_array($items) || count($items) < 1) {
                throw ValidationException::withMessages(['items' => 'At least one item is required']);
            }

            $built = $this->buildItems($tenantId, $items);
            $subtotal = collect($built)->sum(fn ($i) => $i['unit_price_minor'] * $i['quantity']);
            $discount = (int) ($data['discount_minor'] ?? 0);
            $coupon = null;
            $couponCode = $data['coupon_code'] ?? null;
            if (is_string($couponCode) && $couponCode !== '') {
                $linePayload = array_map(fn ($i) => [
                    'product_id' => $i['product_id'] ?? null,
                    'unit_price_minor' => $i['unit_price_minor'],
                    'quantity' => $i['quantity'],
                ], $built);
                $applied = $this->coupons->apply(
                    $tenantId,
                    $couponCode,
                    $subtotal,
                    $linePayload,
                    isset($data['user_id']) ? (int) $data['user_id'] : $actor?->id,
                    (string) ($data['channel'] ?? 'site')
                );
                $discount = $applied['discount_minor'];
                $coupon = $applied['coupon'];
                $couponCode = $coupon->code;
            }
            $shipping = (int) ($data['shipping_minor'] ?? 0);
            $total = max(0, $subtotal - $discount + $shipping);

            $status = $data['status'] ?? 'processing';
            if (! empty($data['is_pay_link'])) {
                $status = $data['status'] ?? 'pending_payment';
            }

            $order = Order::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $data['user_id'] ?? null,
                'created_by' => $actor?->id,
                'number' => $this->nextNumber($tenantId),
                'status' => $status,
                'subtotal_minor' => $subtotal,
                'discount_minor' => $discount,
                'shipping_minor' => $shipping,
                'total_minor' => $total,
                'amount_paid_minor' => $data['amount_paid_minor'] ?? null,
                'currency' => $data['currency'] ?? 'IRR',
                'payment_provider' => $data['payment_provider'] ?? null,
                'payment_ref' => $data['payment_ref'] ?? null,
                'payment_tender' => $data['payment_tender'] ?? null,
                'payment_url' => $data['payment_url'] ?? null,
                'shipping_address' => $data['shipping_address'] ?? null,
                'billing_address' => $data['billing_address'] ?? null,
                'customer_phone' => $data['customer_phone'] ?? null,
                'customer_name' => $data['customer_name'] ?? null,
                'customer_email' => $data['customer_email'] ?? null,
                'customer_note' => $data['customer_note'] ?? null,
                'coupon_code' => $coupon?->code ?? ($couponCode ?: null),
                'coupon_id' => $coupon?->id,
                'sales_channel' => $data['sales_channel'] ?? null,
                'is_pos' => (bool) ($data['is_pos'] ?? false),
                'is_pay_link' => (bool) ($data['is_pay_link'] ?? false),
                'buyer_tax' => $data['buyer_tax'] ?? null,
                'utm_source' => $data['utm_source'] ?? null,
                'utm_medium' => $data['utm_medium'] ?? null,
                'utm_campaign' => $data['utm_campaign'] ?? null,
                'table_number' => $data['table_number'] ?? null,
                'branch_slug' => $data['branch_slug'] ?? null,
                'meta' => $data['meta'] ?? null,
                'c2c_status' => ($data['payment_tender'] ?? null) === 'card_to_card' ? 'pending' : null,
            ]);

            foreach ($built as $row) {
                OrderItem::query()->create(array_merge($row, ['order_id' => $order->id]));
            }

            if ($coupon) {
                $this->coupons->redeem($coupon, $order, $discount, isset($data['user_id']) ? (int) $data['user_id'] : $actor?->id);
            }

            if (! empty($data['is_pay_link']) && empty($order->payment_url)) {
                $order->update([
                    'payment_url' => '/pay/'.$order->id.'?token='.bin2hex(random_bytes(8)),
                ]);
            }

            return $order->fresh()->load(['items.product', 'user', 'creator', 'notes', 'returns']);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function rewrite(Order $order, array $data): Order
    {
        if (in_array($order->status, ['completed', 'refunded', 'cancelled', 'failed'], true)) {
            throw ValidationException::withMessages(['status' => 'Order is locked']);
        }

        return DB::transaction(function () use ($order, $data) {
            if (isset($data['items']) && is_array($data['items'])) {
                $built = $this->buildItems($order->tenant_id, $data['items']);
                $order->items()->delete();
                foreach ($built as $row) {
                    OrderItem::query()->create(array_merge($row, ['order_id' => $order->id]));
                }
                $subtotal = collect($built)->sum(fn ($i) => $i['unit_price_minor'] * $i['quantity']);
                $discount = (int) ($data['discount_minor'] ?? $order->discount_minor);
                $shipping = (int) ($data['shipping_minor'] ?? $order->shipping_minor);
                $data['subtotal_minor'] = $subtotal;
                $data['discount_minor'] = $discount;
                $data['shipping_minor'] = $shipping;
                $data['total_minor'] = max(0, $subtotal - $discount + $shipping);
            }

            $allowed = [
                'status', 'user_id', 'customer_phone', 'customer_name', 'customer_email', 'customer_note',
                'shipping_address', 'billing_address', 'payment_tender', 'payment_provider',
                'sales_channel', 'discount_minor', 'shipping_minor', 'subtotal_minor', 'total_minor',
                'amount_paid_minor', 'buyer_tax', 'meta', 'utm_source', 'utm_medium', 'utm_campaign',
            ];
            $patch = collect($data)->only($allowed)->all();
            if ($patch) {
                $order->update($patch);
            }

            return $order->fresh()->load(['items.product', 'user', 'creator', 'notes', 'returns']);
        });
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<array<string, mixed>>
     */
    protected function buildItems(int $tenantId, array $items): array
    {
        $built = [];
        foreach ($items as $item) {
            $productId = (int) ($item['product_id'] ?? 0);
            $product = Product::query()->where('tenant_id', $tenantId)->whereKey($productId)->first();
            if (! $product) {
                throw ValidationException::withMessages(['items' => "Product {$productId} not found"]);
            }
            $qty = max(1, (int) ($item['quantity'] ?? 1));
            $variantId = isset($item['product_variant_id']) ? (int) $item['product_variant_id'] : null;
            $unit = isset($item['unit_price_minor'])
                ? (int) $item['unit_price_minor']
                : (int) $product->price_minor;

            if ($variantId) {
                $variant = ProductVariant::query()
                    ->where('tenant_id', $tenantId)
                    ->where('product_id', $product->id)
                    ->whereKey($variantId)
                    ->first();
                if ($variant && ! isset($item['unit_price_minor'])) {
                    $unit = (int) $variant->price_minor;
                }
            }

            $built[] = [
                'product_id' => $product->id,
                'product_variant_id' => $variantId,
                'product_name' => $item['product_name'] ?? $product->name,
                'sku' => $item['sku'] ?? $product->sku,
                'quantity' => $qty,
                'unit_price_minor' => $unit,
                'purchase_type' => $item['purchase_type'] ?? 'cash',
                'meta' => $item['meta'] ?? null,
            ];
        }

        return $built;
    }

    protected function nextNumber(int $tenantId): string
    {
        $seq = Order::query()->where('tenant_id', $tenantId)->withTrashed()->count() + 1;

        return 'ORD-'.str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }
}
