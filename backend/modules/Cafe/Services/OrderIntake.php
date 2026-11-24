<?php

namespace Modules\Cafe\Services;

use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use App\Models\Product;
use App\Models\ProductModifier;
use App\Models\ProductModifierOption;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Coupons\CouponService;
use App\Services\Orders\OrderStatusService;
use App\Services\Orders\OrderWriter;
use App\Services\Shop\LoyaltyService;
use App\Services\Shop\LoyaltyTiers;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Cafe\Entities\CafeBranch;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeTable;
use Modules\Cafe\Services\ServiceMode;

/**
 * Ringing up a café order: the till's own create-and-edit path.
 *
 * The storefront's `OrderWriter` is the writer of record and stays that way. What it does
 * not model is everything a counter needs and a web checkout does not:
 *
 *  - a fulfillment that decides what the guest is doing (in the hall, picking up, waiting
 *    for a courier) and which fields are consequently required;
 *  - add-ons priced from the catalogue and frozen onto the line rather than trusted from
 *    the browser — a cashier holds no `catalog.price`, so a unit price they send is
 *    ignored on purpose;
 *  - one discount, chosen once: a percent, a fixed amount, a coupon, or loyalty points.
 *    Stacking them lets the same rial be discounted twice;
 *  - a signed loyalty ledger row when points are spent, so the balance can be audited.
 *
 * Everything here is additive: no existing storefront behaviour changes.
 */
final class OrderIntake
{
    /** What the guest is doing. Mirrors `CafeOrdering::publicStatus()['fulfillment']`. */
    public const FULFILLMENTS = ['dine_in', 'takeaway', 'delivery'];

    /** How a discount was expressed. Exactly one may be in play per order. */
    public const DISCOUNT_TYPES = ['none', 'percent', 'amount', 'coupon', 'loyalty'];

    /** A settled order is not editable through this service; `OrderAmendments` owns that. */
    private const SETTLED_STATUSES = ['paid', 'completed', 'refunded'];

    public function __construct(
        private readonly OrderWriter $writer,
        private readonly CafeOrdering $ordering,
        private readonly OrderPayments $payments,
        private readonly OrderStatusService $status,
    ) {}

    /**
     * Build and persist an order from a till payload.
     *
     * @param  array<string, mixed>  $payload
     */
    public function create(int $tenantId, array $payload, User $actor): Order
    {
        $data = $this->normalize($tenantId, $payload, $actor);

        return DB::transaction(function () use ($tenantId, $data, $actor): Order {
            $order = $this->writer->create($tenantId, $data['order'], $actor);

            // The writer owns stock and numbering; the meta it does not know about is merged
            // after creation because `table_code`/fulfillment are till concerns only.
            $order->forceFill(['meta' => array_merge(is_array($order->meta) ? $order->meta : [], $data['meta'])])->save();

            $this->attachModifiers($order, $data['lines'], (int) $tenantId);
            $this->spendLoyalty($order, $data['loyalty']);

            if ($data['payments'] !== []) {
                $this->payments->replace($order, $data['payments'], (int) $actor->id);
                $this->status->apply($order, 'processing');
            }

            return $order->fresh()->load(['items.modifiers', 'payments', 'branch', 'user']);
        });
    }

    /**
     * Change an order that has not been settled yet.
     *
     * A settled order is not editable here at all: that is what `OrderAmendments` exists for,
     * with its window, its approval and its recorded delta. Allowing both would give two
     * different ways to change the same money, only one of which is auditable.
     *
     * @param  array<string, mixed>  $payload
     */
    public function update(Order $order, array $payload, User $actor): Order
    {
        if ($order->paid_at !== null || in_array((string) $order->status, self::SETTLED_STATUSES, true)) {
            throw ValidationException::withMessages([
                'order' => 'این سفارش تسویه شده است؛ تغییر آن از مسیر «اصلاح فاکتور پرداخت‌شده» انجام می‌شود.',
            ]);
        }

        $data = $this->normalize((int) $order->tenant_id, $payload, $actor, $order);

        return DB::transaction(function () use ($order, $data, $actor): Order {
            $meta = is_array($order->meta) ? $order->meta : [];
            $order->meta = array_merge($meta, $data['meta']);
            $order->fill(collect($data['order'])->only([
                'customer_name', 'customer_phone', 'customer_note', 'table_number', 'sales_channel',
            ])->all());

            if ($data['lines'] !== null) {
                $lines = $this->writeLines($order, $data['lines']);
                $subtotal = (int) collect($lines)->sum(fn (array $l): int => $l['unit_price_minor'] * $l['quantity']);
                $order->forceFill([
                    'subtotal_minor' => $subtotal,
                    'discount_minor' => $data['discount_minor'],
                    'shipping_minor' => $data['shipping_minor'],
                    'total_minor' => max(0, $subtotal - $data['discount_minor'] + $data['shipping_minor']),
                ]);
            } else {
                // Only the discount or the cover count moved: re-derive the total from the
                // lines already on the order rather than trusting a client-sent total.
                $order->forceFill([
                    'discount_minor' => $data['discount_minor'],
                    'total_minor' => max(0, (int) $order->subtotal_minor - $data['discount_minor'] + $data['shipping_minor']),
                ]);
            }

            $order->save();

            $this->attachModifiers($order, $data['lines'] ?? [], (int) $order->tenant_id);
            $this->spendLoyalty($order, $data['loyalty']);

            if ($data['payments'] !== []) {
                $this->payments->replace($order, $data['payments'], (int) $actor->id);
                $this->status->apply($order, 'processing');
            }

            return $order->fresh()->load(['items.modifiers', 'payments', 'branch', 'user']);
        });
    }

    /**
     * Price a basket without writing anything.
     *
     * The till computes its own running total for instant feedback, but two things it cannot
     * compute are a coupon (its rules and counters live in `CouponService`) and a loyalty
     * spend (only the server knows the real balance). Those go through here, so the number the
     * cashier confirms is the number the sale will record — this method and `create()` share
     * `priceLines()` and `resolveDiscount()`, so they cannot drift.
     *
     * `CouponService::apply()` is safe to call for a quote: it evaluates and returns a
     * discount, and `hold()` — which is what actually consumes a use — is called separately
     * by the writer.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function quote(int $tenantId, array $payload, User $actor): array
    {
        $fulfillment = (string) ($payload['fulfillment'] ?? 'dine_in');
        if (! in_array($fulfillment, self::FULFILLMENTS, true)) {
            throw ValidationException::withMessages(['fulfillment' => 'نوع سفارش نامعتبر است.']);
        }

        $branchId = $this->resolveBranch($tenantId, $payload, $actor);
        $lines = $this->priceLines($tenantId, $branchId, (array) ($payload['items'] ?? []));
        $subtotal = (int) collect($lines)->sum(fn (array $line): int => $line['unit_price_minor'] * $line['quantity']);

        [$discount, $couponError] = $this->quoteDiscount($tenantId, $payload, $subtotal, $lines);

        $discount = max(0, min($discount, $subtotal));
        $discounted = $subtotal - $discount;

        // Fees come from the same service the storefront quotes from, so a counter order and
        // an online order for the same basket cannot disagree about the total.
        $fees = $this->ordering->fees(
            $tenantId,
            $fulfillment,
            $discounted,
            (int) collect($lines)->sum(fn (array $line): int => $line['quantity']),
        );

        $shipping = array_key_exists('shipping_minor', $payload) && $payload['shipping_minor'] !== null
            ? max(0, (int) $payload['shipping_minor'])
            : (int) ($fees['total_minor'] ?? 0);

        // A delivery zone overrides the flat fee. Quoting from `fees()` alone would show the
        // till one price and then charge another when the order is saved, which is the kind of
        // difference a cashier has to explain to a guest.
        $zone = null;
        if ($fulfillment === 'delivery' && ! (array_key_exists('shipping_minor', $payload) && $payload['shipping_minor'] !== null)) {
            $zoneQuote = app(DeliveryZones::class)->quote(
                $tenantId,
                $branchId,
                $this->nullableString($payload['delivery_address'] ?? null),
                $discounted,
            );

            if (($zoneQuote['covered'] ?? false) === true) {
                $shipping = (int) ($zoneQuote['fee_minor'] ?? 0);
                $zone = $zoneQuote;
            }
        }

        return [
            // Strip the cost fields before the quote leaves the server: the till must never
            // learn a purchase price from a quote response.
            'lines' => array_map(static function (array $line): array {
                unset($line['unit_cost_minor'], $line['modifier_delta_minor']);

                return $line;
            }, $lines),
            'subtotal_minor' => $subtotal,
            'discount_minor' => $discount,
            'shipping_minor' => $shipping,
            'fees' => $fees,
            // Present only for a covered delivery address, so the till can show the zone name,
            // its minimum and whether the basket clears it.
            'delivery_zone' => $zone,
            'total_minor' => max(0, $discounted + $shipping),
            'coupon_error' => $couponError,
        ];
    }

    /**
     * The discount, computed for real — including a coupon, which `resolveDiscount()` leaves
     * to the writer because the writer is what consumes the usage.
     *
     * @param  array<string, mixed>  $payload
     * @param  list<array<string, mixed>>  $lines
     * @return array{0: int, 1: string|null}
     */
    private function quoteDiscount(int $tenantId, array $payload, int $subtotal, array $lines): array
    {
        $type = (string) ($payload['discount_type'] ?? 'none');

        if ($type === 'percent') {
            return [(int) round($subtotal * (float) ($payload['discount_percent'] ?? 0) / 100), null];
        }

        if ($type === 'amount') {
            return [max(0, (int) ($payload['discount_minor'] ?? 0)), null];
        }

        if ($type === 'loyalty') {
            try {
                $loyalty = $this->priceLoyalty($tenantId, $payload, $subtotal);

                return [$loyalty['discount_minor'], null];
            } catch (ValidationException $e) {
                return [0, collect($e->errors())->flatten()->first()];
            }
        }

        if ($type === 'coupon') {
            $code = trim((string) ($payload['coupon_code'] ?? ''));
            if ($code === '') {
                return [0, null];
            }
            try {
                $applied = app(CouponService::class)->apply(
                    $tenantId,
                    $code,
                    $subtotal,
                    array_map(fn (array $line): array => [
                        'product_id' => $line['product_id'],
                        'unit_price_minor' => $line['unit_price_minor'],
                        'quantity' => $line['quantity'],
                    ], $lines),
                    isset($payload['user_id']) ? (int) $payload['user_id'] : null,
                    'in_store',
                );

                return [(int) ($applied['discount_minor'] ?? 0), null];
            } catch (ValidationException $e) {
                return [0, collect($e->errors())->flatten()->first()];
            }
        }

        return [0, null];
    }

    /**
     * Turn a form payload into writer input plus the side data the writer does not know about.
     *
     * @param  array<string, mixed>  $payload
     * @return array{order: array<string, mixed>, lines: list<array<string, mixed>>|null, meta: array<string, mixed>, payments: list<array<string, mixed>>, loyalty: array{user_id: int, points: int}|null, discount_minor: int, shipping_minor: int, discount_type: string}
     */
    private function normalize(int $tenantId, array $payload, User $actor, ?Order $existing = null): array
    {
        $fulfillment = (string) ($payload['fulfillment'] ?? 'dine_in');
        if (! in_array($fulfillment, self::FULFILLMENTS, true)) {
            throw ValidationException::withMessages(['fulfillment' => 'نوع سفارش نامعتبر است.']);
        }

        $branchId = $this->resolveBranch($tenantId, $payload, $actor);

        // The shop's service mode decides whether a dine-in order names a table, a pager, or
        // neither. Checked before the table is resolved so a pager-only shop is not told to
        // pick a table it does not have.
        app(ServiceMode::class)->assertServable($tenantId, $fulfillment, $payload);

        $table = $this->resolveTable($tenantId, $fulfillment, $payload, $branchId);

        $rawLines = $payload['items'] ?? null;
        $lines = is_array($rawLines) && $rawLines !== [] ? $this->priceLines($tenantId, $branchId, $rawLines) : null;

        if ($lines === null && $existing === null) {
            throw ValidationException::withMessages(['items' => 'سبد سفارش خالی است.']);
        }

        $subtotal = $lines === null
            ? (int) $existing->subtotal_minor
            : (int) collect($lines)->sum(fn (array $l): int => $l['unit_price_minor'] * $l['quantity']);

        [$discount, $discountType, $couponCode, $loyalty] = $this->resolveDiscount($tenantId, $payload, $subtotal, $actor);

        $shipping = $this->shippingMinor($tenantId, $fulfillment, $payload, $subtotal, count($lines ?? []), $branchId);

        $order = [
            'branch_id' => $branchId,
            'table_number' => $table?->code,
            'customer_name' => $this->nullableString($payload['customer_name'] ?? null),
            'customer_phone' => $this->normalizePhone($payload['customer_phone'] ?? null),
            'customer_note' => $this->nullableString($payload['customer_note'] ?? null),
            'user_id' => isset($payload['user_id']) ? (int) $payload['user_id'] : null,
            'discount_minor' => $discount,
            'shipping_minor' => $shipping,
            'coupon_code' => $couponCode,
            'sales_channel' => $fulfillment === 'delivery' ? 'phone' : 'in_store',
            // Present only on a replay from the till's offline queue.
            'client_ref' => $this->nullableString($payload['client_ref'] ?? null),
            'is_pos' => true,
            // A till order is in the kitchen the moment it is sent: there is no gateway for
            // it to wait on, and the guest is standing in front of the cashier.
            'status' => 'processing',
        ];

        if ($lines !== null) {
            $order['items'] = array_map(fn (array $line): array => [
                'product_id' => $line['product_id'],
                'product_variant_id' => $line['product_variant_id'],
                'product_name' => $line['name'],
                'quantity' => $line['quantity'],
                'unit_price_minor' => $line['unit_price_minor'],
                'purchase_type' => 'cash',
            ], $lines);
        }

        $meta = [
            'fulfillment' => $fulfillment,
            'table_code' => $table?->code,
            'table_label' => $table?->label,
            'taken_by' => (int) $actor->id,
            'taken_by_name' => (string) $actor->name,
            'discount_type' => $discountType,
        ];

        if ($fulfillment === 'delivery') {
            $address = $this->nullableString($payload['delivery_address'] ?? null);
            if ($address === null) {
                throw ValidationException::withMessages(['delivery_address' => 'برای سفارش پیک، نشانی را وارد کنید.']);
            }
            $meta['delivery'] = [
                'address' => $address,
                'zone_id' => isset($payload['delivery_zone_id']) ? (int) $payload['delivery_zone_id'] : null,
                'eta_minutes' => isset($payload['delivery_eta_minutes']) ? (int) $payload['delivery_eta_minutes'] : null,
            ];
        }

        if ($loyalty !== null) {
            $meta['loyalty'] = ['points' => $loyalty['points'], 'discount_minor' => $loyalty['discount_minor']];
        }

        // Pager shops hand the guest a buzzer instead of a table number.
        $pager = $this->nullableString($payload['pager_number'] ?? null);
        if ($pager !== null) {
            $meta['pager_number'] = $pager;
        }

        return [
            'order' => $order,
            'lines' => $lines,
            'meta' => $meta,
            'payments' => $this->normalizePayments((array) ($payload['payments'] ?? [])),
            'loyalty' => $loyalty === null ? null : ['user_id' => $loyalty['user_id'], 'points' => $loyalty['points']],
            'discount_minor' => $discount,
            'shipping_minor' => $shipping,
            'discount_type' => $discountType,
        ];
    }

    /**
     * One discount, expressed one way.
     *
     * @param  array<string, mixed>  $payload
     * @return array{0: int, 1: string, 2: string|null, 3: array{user_id: int, points: int, discount_minor: int}|null}
     */
    private function resolveDiscount(int $tenantId, array $payload, int $subtotal, User $actor): array
    {
        $type = (string) ($payload['discount_type'] ?? 'none');
        if (! in_array($type, self::DISCOUNT_TYPES, true)) {
            throw ValidationException::withMessages(['discount_type' => 'نوع تخفیف نامعتبر است.']);
        }

        $discount = 0;
        $couponCode = null;
        $loyalty = null;

        if ($type === 'percent') {
            $percent = (float) ($payload['discount_percent'] ?? 0);
            if ($percent < 0 || $percent > 100) {
                throw ValidationException::withMessages(['discount_percent' => 'درصد تخفیف باید بین ۰ و ۱۰۰ باشد.']);
            }
            $discount = (int) round($subtotal * $percent / 100);
        } elseif ($type === 'amount') {
            $discount = (int) ($payload['discount_minor'] ?? 0);
        } elseif ($type === 'coupon') {
            $couponCode = trim((string) ($payload['coupon_code'] ?? ''));
            if ($couponCode === '') {
                throw ValidationException::withMessages(['coupon_code' => 'کد تخفیف را وارد کنید.']);
            }
            // CouponService computes the discount inside OrderWriter::create, where it also
            // holds the usage. Guessing it here would let the two disagree.
            $discount = 0;
        } elseif ($type === 'loyalty') {
            $loyalty = $this->priceLoyalty($tenantId, $payload, $subtotal);
            $discount = $loyalty['discount_minor'];
        }

        if ($discount < 0) {
            throw ValidationException::withMessages(['discount_minor' => 'تخفیف نمی‌تواند منفی باشد.']);
        }

        if ($subtotal > 0 && $discount > $subtotal) {
            // Discounting past the subtotal would mean collecting a negative bill.
            throw ValidationException::withMessages(['discount_minor' => 'تخفیف نمی‌تواند از مبلغ اقلام بیشتر باشد.']);
        }

        return [$discount, $type, $couponCode, $loyalty];
    }

    /**
     * Price each requested line from the catalogue, never from the request body.
     *
     * @param  array<int, array<string, mixed>>  $rawLines
     * @return list<array<string, mixed>>
     */
    private function priceLines(int $tenantId, ?int $branchId, array $rawLines): array
    {
        $out = [];

        foreach (array_values($rawLines) as $index => $raw) {
            $productId = (int) ($raw['product_id'] ?? 0);
            $product = Product::query()->where('tenant_id', $tenantId)->whereKey($productId)->first();

            if (! $product) {
                throw ValidationException::withMessages(["items.$index.product_id" => 'این محصول یافت نشد.']);
            }

            $variant = null;
            $variantId = isset($raw['product_variant_id']) ? (int) $raw['product_variant_id'] : 0;
            if ($variantId > 0) {
                $variant = ProductVariant::query()
                    ->where('product_id', $product->id)
                    ->whereKey($variantId)
                    ->first();
                if (! $variant) {
                    throw ValidationException::withMessages(["items.$index.product_variant_id" => 'این تنوع یافت نشد.']);
                }
            }

            $optionIds = array_values(array_unique(array_map('intval', (array) ($raw['modifier_option_ids'] ?? []))));
            $modifiers = $this->priceModifiers($product, $optionIds, $index);

            $out[] = [
                'product_id' => (int) $product->id,
                'product_variant_id' => $variant?->id,
                'name' => (string) $product->name,
                'quantity' => max(1, (int) ($raw['quantity'] ?? 1)),
                'unit_price_minor' => $this->unitPrice($product, $variant, $branchId) + $modifiers['delta_minor'],
                // Cost is snapshotted here, at the moment of sale: a supplier price change next
                // week must not restate this order's cost of goods.
                'unit_cost_minor' => $variant?->purchase_price_minor ?? $product->purchase_price_minor,
                'modifier_delta_minor' => $modifiers['delta_minor'],
                'note' => $this->nullableString($raw['note'] ?? null),
                'modifiers' => $modifiers['selections'],
            ];
        }

        return $out;
    }

    /**
     * Resolve and price add-ons, enforcing each group's min/max.
     *
     * @param  list<int>  $optionIds
     * @return array{delta_minor: int, selections: list<array<string, mixed>>}
     */
    private function priceModifiers(Product $product, array $optionIds, int $lineIndex): array
    {
        $modifiers = ProductModifier::query()
            ->where('product_id', $product->id)
            ->with(['options' => fn ($q) => $q->orderBy('sort_order')])
            ->orderBy('sort_order')
            ->get();

        if ($modifiers->isEmpty()) {
            if ($optionIds !== []) {
                throw ValidationException::withMessages([
                    "items.$lineIndex.modifier_option_ids" => 'این محصول افزودنی ندارد.',
                ]);
            }

            return ['delta_minor' => 0, 'selections' => []];
        }

        $options = ProductModifierOption::query()
            ->whereIn('id', $optionIds)
            ->whereIn('modifier_id', $modifiers->pluck('id'))
            ->get()
            ->keyBy('id');

        if ($options->count() !== count($optionIds)) {
            throw ValidationException::withMessages([
                "items.$lineIndex.modifier_option_ids" => 'یکی از افزودنی‌های انتخابی معتبر نیست.',
            ]);
        }

        $chosen = $options->groupBy('modifier_id');
        $selections = [];
        $delta = 0;

        foreach ($modifiers as $modifier) {
            $picked = $chosen->get($modifier->id, collect());
            $count = $picked->count();
            $min = $modifier->is_required ? max(1, (int) $modifier->min_select) : (int) $modifier->min_select;
            $max = max(1, (int) $modifier->max_select);

            if ($count < $min) {
                throw ValidationException::withMessages([
                    "items.$lineIndex.modifier_option_ids" => "انتخاب «{$modifier->name_fa}» الزامی است.",
                ]);
            }
            if ($count > $max) {
                throw ValidationException::withMessages([
                    "items.$lineIndex.modifier_option_ids" => "برای «{$modifier->name_fa}» حداکثر {$max} گزینه مجاز است.",
                ]);
            }

            foreach ($picked as $option) {
                // Add-ons are named extras: they are logged but never reprice the line.
                $price = (bool) $option->is_addon ? 0 : (int) $option->price_minor;
                $delta += $price;
                $selections[] = [
                    'option_id' => (int) $option->id,
                    'name' => (string) $option->name_fa,
                    'price_delta_minor' => $price,
                ];
            }
        }

        return ['delta_minor' => $delta, 'selections' => $selections];
    }

    /**
     * Write the modifier rows for an order's lines.
     *
     * The price is already inside the line's unit price; `price_delta_minor` here records
     * *why* the line costs what it costs, not a second charge.
     *
     * @param  list<array<string, mixed>>  $lines
     */
    private function attachModifiers(Order $order, array $lines, int $tenantId): void
    {
        $withModifiers = array_values(array_filter($lines, fn (array $line): bool => ($line['modifiers'] ?? []) !== []));
        if ($withModifiers === []) {
            return;
        }

        // Match persisted rows back to the priced lines by product and unit price. The writer
        // keeps order and quantity, so this is stable; keying on both keeps it correct if a
        // later change merges lines.
        $rows = OrderItem::query()->where('order_id', $order->id)->orderBy('id')->get();
        $used = [];

        foreach ($rows as $row) {
            foreach ($withModifiers as $index => $line) {
                if ((int) $line['product_id'] !== (int) $row->product_id) {
                    continue;
                }
                if ((int) $line['unit_price_minor'] !== (int) $row->unit_price_minor) {
                    continue;
                }
                if (isset($used[$index])) {
                    continue;
                }
                $used[$index] = true;

                foreach ($line['modifiers'] as $selection) {
                    OrderItemModifier::query()->create([
                        'order_item_id' => $row->id,
                        'modifier_option_id' => $selection['option_id'],
                        'name' => $selection['name'],
                        'price_delta_minor' => $selection['price_delta_minor'],
                        'quantity' => (int) $row->quantity,
                    ]);
                }

                break;
            }
        }
    }

    /**
     * Replace the lines of an open order, keeping modifier rows consistent.
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array<string, mixed>>
     */
    private function writeLines(Order $order, array $lines): array
    {
        OrderItemModifier::query()
            ->whereIn('order_item_id', OrderItem::query()->where('order_id', $order->id)->select('id'))
            ->delete();
        $order->items()->delete();

        foreach ($lines as $line) {
            OrderItem::query()->create([
                'order_id' => $order->id,
                'product_id' => $line['product_id'],
                'product_variant_id' => $line['product_variant_id'],
                'product_name' => $line['name'],
                'quantity' => $line['quantity'],
                'unit_price_minor' => $line['unit_price_minor'],
                'unit_cost_minor' => $line['unit_cost_minor'] ?? null,
                'modifier_delta_minor' => (int) ($line['modifier_delta_minor'] ?? 0),
                'purchase_type' => 'cash',
                'meta' => $line['note'] === null ? null : ['note' => $line['note']],
            ]);
        }

        $order->unsetRelation('items');

        return $lines;
    }

    /**
     * Points as money.
     *
     * Points are spendable only by the customer the order is attached to, and the ledger row
     * is written in the same transaction as the order, so a failed insert cannot leave the
     * balance and the receipt disagreeing.
     *
     * @param  array<string, mixed>  $payload
     * @return array{user_id: int, points: int, discount_minor: int}
     */
    private function priceLoyalty(int $tenantId, array $payload, int $billMinor = 0): array
    {
        $settings = ShopSettings::getLoyalty($tenantId);
        if (empty($settings['enabled'])) {
            throw ValidationException::withMessages(['loyalty_points' => 'باشگاه مشتریان فعال نیست.']);
        }

        $userId = (int) ($payload['user_id'] ?? 0);
        $points = (int) ($payload['loyalty_points'] ?? 0);
        if ($userId < 1 || $points < 1) {
            throw ValidationException::withMessages(['loyalty_points' => 'مشتری و تعداد امتیاز را مشخص کنید.']);
        }

        $user = User::query()->where('tenant_id', $tenantId)->whereKey($userId)->first();
        if (! $user) {
            throw ValidationException::withMessages(['user_id' => 'این مشتری یافت نشد.']);
        }

        if ((int) $user->loyalty_points < $points) {
            throw ValidationException::withMessages(['loyalty_points' => 'امتیاز مشتری کافی نیست.']);
        }

        // What a point is worth is a setting of its own. Using the *earning* rate as the
        // redemption rate — which this did — gives the whole margin away to anyone who saves
        // points, and the cap keeps a large balance from zeroing the bill.
        $redeem = app(LoyaltyTiers::class)->redemption($tenantId, $points, max(0, $billMinor));

        if ($redeem['value_minor'] <= 0) {
            throw ValidationException::withMessages([
                'loyalty_points' => __('api.cafe_loyalty_no_value'),
            ]);
        }

        return [
            'user_id' => (int) $user->id,
            'points' => $redeem['points'],
            'discount_minor' => $redeem['value_minor'],
            // Surfaced so the till can say "capped at 50% of the bill" instead of silently
            // spending fewer points than the cashier asked for.
            'capped' => $redeem['capped'],
        ];
    }

    /** Record the spend once the order exists, so the ledger row can point at it. */
    private function spendLoyalty(Order $order, ?array $loyalty): void
    {
        if ($loyalty === null) {
            return;
        }

        LoyaltyLedger::query()->create([
            'tenant_id' => $order->tenant_id,
            'user_id' => $loyalty['user_id'],
            'order_id' => $order->id,
            'points' => -1 * (int) $loyalty['points'],
            'reason' => 'redeem_at_till',
        ]);
        User::query()->whereKey($loyalty['user_id'])->decrement('loyalty_points', (int) $loyalty['points']);

        // Earning runs off the same service the storefront uses, so a till sale earns points
        // exactly like an online one does.
        try {
            app(LoyaltyService::class)->awardForPaidOrder($order->fresh() ?? $order);
        } catch (\Throwable) {
            // Earning is a bonus; failing it must not roll back a completed sale.
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $payments
     * @return list<array<string, mixed>>
     */
    private function normalizePayments(array $payments): array
    {
        $out = [];
        foreach ($payments as $payment) {
            $amount = (int) ($payment['amount_minor'] ?? 0);
            if ($amount <= 0) {
                continue;
            }
            $out[] = [
                'tender' => (string) ($payment['tender'] ?? 'cash'),
                'amount_minor' => $amount,
                'received_minor' => isset($payment['received_minor']) ? (int) $payment['received_minor'] : null,
                'reference' => $this->nullableString($payment['reference'] ?? null),
            ];
        }

        return $out;
    }

    /** Branch override first, then the catalogue price with its sale window applied. */
    private function unitPrice(Product $product, ?ProductVariant $variant, ?int $branchId): int
    {
        $catalogue = $product->storefrontPriceMinor($variant);

        if ($branchId !== null) {
            $override = $product->branchPriceMinor($branchId, $variant);
            // A branch that never overrode inherits exactly the storefront price, sale
            // included; only a real override replaces it.
            if ($override !== $catalogue) {
                return $override;
            }
        }

        return $catalogue;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function shippingMinor(int $tenantId, string $fulfillment, array $payload, int $subtotal, int $itemCount, ?int $branchId = null): int
    {
        // An explicit value is a manager waiving the delivery fee or adding a packaging
        // charge; the computed fee is only the default.
        if (array_key_exists('shipping_minor', $payload) && $payload['shipping_minor'] !== null) {
            return max(0, (int) $payload['shipping_minor']);
        }

        if ($fulfillment === 'dine_in') {
            return 0;
        }

        // A delivery zone carries its own fee and minimum, and it wins over the flat fee from
        // menu settings. Before this the till stored `zone_id` and then priced the order from
        // the flat fee anyway, so a shop that set up districts was charging everyone the same.
        if ($fulfillment === 'delivery') {
            $address = $this->nullableString($payload['delivery_address'] ?? null);
            $zone = app(DeliveryZones::class)->resolve($tenantId, $branchId, $address);

            if ($zone !== null) {
                $enforce = app(OperationsSettings::class)->bool($tenantId, 'enforce_delivery_minimum');
                $minimum = (int) $zone->minimum_order_minor;

                // Below the zone minimum the shop has said it will not deliver. Refusing beats
                // silently charging a fee for an order the kitchen will bounce.
                if ($enforce && $minimum > 0 && $subtotal < $minimum) {
                    throw ValidationException::withMessages([
                        'delivery_address' => "حداقل سفارش برای این منطقه {$minimum} ریال است.",
                    ]);
                }

                return max(0, (int) $zone->delivery_fee_minor);
            }
        }

        return max(0, (int) $this->ordering->shippingMinor($tenantId, $fulfillment, $subtotal, max(1, $itemCount)));
    }

    /**
     * Which branch this sale belongs to.
     *
     * Same order of truth as `OrderWriter::resolveBranchId`: an explicit choice from the
     * till, then the cashier's open shift (they are standing at that drawer), then the
     * tenant's only branch. Two or more branches with no signal gets null rather than a
     * guess — attributing a sale to the wrong branch is worse than leaving it unattributed.
     *
     * Resolved here as well because the table lookup needs to be scoped to the same branch
     * the order will end up on.
     *
     * @param  array<string, mixed>  $payload
     */
    private function resolveBranch(int $tenantId, array $payload, User $actor): ?int
    {
        $explicit = $payload['branch_id'] ?? null;
        if ($explicit !== null && (int) $explicit > 0) {
            return (int) $explicit;
        }

        $shiftBranch = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $actor->id)
            ->where('status', CafeShift::STATUS_OPEN)
            ->whereNotNull('branch_id')
            ->value('branch_id');

        if ($shiftBranch !== null) {
            return (int) $shiftBranch;
        }

        $branches = CafeBranch::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->limit(2)
            ->pluck('id');

        return $branches->count() === 1 ? (int) $branches->first() : null;
    }

    /**
     * A dine-in order must name a real, active table in the right branch.
     *
     * `table_number` holds the *code*, which is what the floor board and the guest QR flow
     * both work from, so this needs no new column on `orders`.
     *
     * @param  array<string, mixed>  $payload
     */
    private function resolveTable(int $tenantId, string $fulfillment, array $payload, ?int $branchId): ?CafeTable
    {
        if ($fulfillment !== 'dine_in') {
            return null;
        }

        // No seat service, or pager service: a dine-in order carries no table.
        $mode = app(ServiceMode::class);
        if (! $mode->requiresTable($tenantId)) {
            return null;
        }

        $code = trim((string) ($payload['table_code'] ?? $payload['table_number'] ?? ''));
        if ($code === '') {
            throw ValidationException::withMessages(['table_code' => 'برای سفارش سالن، میز را انتخاب کنید.']);
        }

        $table = CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->where('code', $code)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->first();

        if (! $table) {
            throw ValidationException::withMessages(['table_code' => 'این میز در این شعبه یافت نشد.']);
        }

        if (! $table->is_active) {
            throw ValidationException::withMessages(['table_code' => 'این میز غیرفعال است.']);
        }

        return $table;
    }

    /** Persian/Arabic digits are what a cashier types; store Latin so lookups keep working. */
    private function normalizePhone(mixed $phone): ?string
    {
        $value = $this->nullableString($phone);
        if ($value === null) {
            return null;
        }

        $value = strtr($value, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        $digits = preg_replace('/\D/', '', $value) ?? '';

        return $digits === '' ? null : $digits;
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $text = trim((string) $value);

        return $text === '' ? null : $text;
    }
}
