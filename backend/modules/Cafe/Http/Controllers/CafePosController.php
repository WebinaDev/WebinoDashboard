<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Orders\PosCustomerResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Entities\CafeBranch;
use Modules\Cafe\Entities\CafeShift;
use Modules\Cafe\Entities\CafeTable;
use Modules\Cafe\Services\CafeOrdering;
use Modules\Cafe\Services\OrderIntake;
use Modules\Cafe\Services\OrderPayments;

/**
 * The till screen: what to show the cashier, and taking the order they build.
 *
 * Kept apart from `CafeOperationsController` because this is order *entry* while that one is
 * order *lifecycle* (settle, void, prep, amend). They share the same tables and services but
 * different screens, different capabilities and very different failure modes.
 *
 * Every read here is sized for a tablet on café wifi: the menu is fetched once and filtered
 * client-side, rather than firing a product search per keystroke over a phone hotspot.
 */
class CafePosController extends Controller
{
    public function __construct(
        private readonly OrderIntake $intake,
        private readonly CafeOrdering $ordering,
        private readonly OrderPayments $payments,
    ) {}

    /**
     * Everything the till needs to render, in one request.
     *
     * Three round trips on a busy tablet is three chances to stare at a spinner; the catalogue
     * is small enough (a café menu, not a marketplace) to send whole.
     */
    public function bootstrap(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $branchId = $request->integer('branch_id') ?: null;

        $status = $this->ordering->publicStatus($tenantId);

        $tables = CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('code')
            ->get(['id', 'branch_id', 'code', 'label', 'seats', 'status']);

        return response()->json([
            'data' => [
                'branches' => CafeBranch::query()
                    ->where('tenant_id', $tenantId)
                    ->where('is_active', true)
                    ->orderBy('sort_order')
                    ->get(['id', 'name_fa', 'name_en', 'slug']),
                'tables' => $tables->map(fn (CafeTable $table): array => [
                    'id' => $table->id,
                    'branch_id' => $table->branch_id,
                    'code' => (string) $table->code,
                    'label' => $table->label,
                    'seats' => (int) $table->seats,
                    'status' => (string) ($table->status ?? CafeTable::STATUS_FREE),
                ])->all(),
                'products' => $this->catalogue($tenantId, $branchId),
                'tenders' => OrderPayments::TENDERS,
                'fulfillment' => $status['fulfillment'] ?? [
                    'dine_in' => true, 'pickup' => true, 'delivery' => false,
                ],
                // Fees come from the same menu the storefront quotes, so a counter order and
                // an online order for the same basket never disagree about the total.
                'fees' => [
                    'packaging_minor' => (int) ($status['packaging_fee_minor'] ?? 0),
                    'packaging_mode' => $status['packaging_fee_mode'] ?? 'per_order',
                    'service_percent' => (float) ($status['service_fee_percent'] ?? 0),
                    'service_dine_in_only' => (bool) ($status['service_fee_dine_in_only'] ?? true),
                    'delivery_minor' => (int) ($status['delivery_fee_minor'] ?? 0),
                    'free_delivery_from_minor' => (int) ($status['free_delivery_threshold_minor'] ?? 0),
                ],
                'loyalty_enabled' => (bool) (\App\Services\Shop\ShopSettings::getLoyalty($tenantId)['enabled'] ?? false),
                // table | pager | none: which field a dine-in order needs, if any. Sent with
                // the bootstrap so the till never has to guess.
                'service' => app(\Modules\Cafe\Services\ServiceMode::class)->requirements($tenantId),
                // The open drawer, so the till can remember it while it still has a network.
                // Offline, `OrderIntake::resolveBranch` can no longer read the cashier's shift —
                // it would fall back to "no branch" and the cash pickup at close would come
                // out short with no way to say which counter it belonged to.
                'shift' => $this->openShift($tenantId, (int) $request->user()->id),
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * The cashier's open shift, in the smallest shape the till can store and replay.
     *
     * Deliberately not the shift's money: expected cash is derived on the server from the sales
     * themselves, and sending a figure to the browser would let a stale tab restate a drawer.
     *
     * @return array{id: int, branch_id: int|null, opened_at: string|null}|null
     */
    private function openShift(int $tenantId, int $userId): ?array
    {
        $shift = CafeShift::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->where('status', CafeShift::STATUS_OPEN)
            ->orderByDesc('id')
            ->first(['id', 'branch_id', 'opened_at']);

        if ($shift === null) {
            return null;
        }

        return [
            'id' => (int) $shift->id,
            'branch_id' => $shift->branch_id === null ? null : (int) $shift->branch_id,
            'opened_at' => $shift->opened_at?->toIso8601String(),
        ];
    }

    /** Create an order from the till. */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $tenantId = (int) $request->user()->tenant_id;

        // An offline till replays the sale it captured at the counter. The client reference is
        // what makes that safe: the same reference returns the order that already exists instead
        // of charging the guest a second time. `replayed` says so, because the cashier's "sale
        // saved" toast should not claim a new order was created.
        $clientRef = $request->input('client_ref');
        if (is_string($clientRef) && $clientRef !== '') {
            $existing = Order::query()
                ->where('tenant_id', $tenantId)
                ->where('client_ref', $clientRef)
                ->with(['items.modifiers', 'payments', 'branch', 'user'])
                ->first();

            if ($existing !== null) {
                return response()->json(['data' => $this->present($existing), 'meta' => ['replayed' => true]]);
            }
        }

        $order = $this->intake->create($tenantId, $data + ['client_ref' => $clientRef], $request->user());

        return response()->json(['data' => $this->present($order)], 201);
    }

    /**
     * Edit an open order.
     *
     * A settled one is refused by the service; the response then points at the amendment
     * flow instead of pretending the edit happened.
     */
    public function update(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $data = $this->validated($request, true);

        return response()->json(['data' => $this->present($this->intake->update($order, $data, $request->user()))]);
    }

    /** One order, for re-opening it in the till. */
    public function show(Request $request, Order $order): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $order->tenant_id, 403);

        $order->load(['items.modifiers', 'payments', 'branch', 'user']);

        $table = null;
        $code = trim((string) ($order->table_number ?? ''));
        if ($code !== '') {
            $table = CafeTable::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('code', $code)
                ->first(['id', 'code', 'label']);
        }

        $meta = is_array($order->meta) ? $order->meta : [];

        return response()->json([
            'data' => array_merge($this->present($order), [
                'table' => $table === null ? null : [
                    'id' => $table->id,
                    'code' => (string) $table->code,
                    'label' => $table->label,
                ],
                'fulfillment' => $meta['fulfillment'] ?? 'dine_in',
                'delivery' => $meta['delivery'] ?? null,
                'discount_type' => $meta['discount_type'] ?? 'none',
                'editable' => $order->paid_at === null
                    && ! in_array((string) $order->status, ['paid', 'completed', 'refunded', 'cancelled'], true),
            ]),
        ]);
    }

    /**
     * Price the basket without saving anything.
     *
     * The till keeps its own running total for instant feedback, but a coupon and a loyalty
     * spend can only be priced by the server. This is the number the cashier confirms, and it
     * comes from the same code that will write the sale.
     */
    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'fulfillment' => ['required', 'string', Rule::in(OrderIntake::FULFILLMENTS)],
            'branch_id' => ['nullable', 'integer'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.product_variant_id' => ['nullable', 'integer'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:999'],
            'items.*.modifier_option_ids' => ['nullable', 'array'],
            'items.*.modifier_option_ids.*' => ['integer'],
            'items.*.note' => ['nullable', 'string', 'max:200'],
            'discount_type' => ['nullable', 'string', Rule::in(OrderIntake::DISCOUNT_TYPES)],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_minor' => ['nullable', 'integer', 'min:0'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'loyalty_points' => ['nullable', 'integer', 'min:0'],
            'user_id' => ['nullable', 'integer'],
            'shipping_minor' => ['nullable', 'integer', 'min:0'],
        ]);

        return response()->json([
            'data' => $this->intake->quote((int) $request->user()->tenant_id, $data, $request->user()),
        ]);
    }

    /**
     * Guest lookup by mobile, for attaching a sale to a named customer.
     *
     * Matches on the last 10 digits so `۰۹۱۲…`, `+98912…` and `0912…` all find the same
     * person — a cashier reads the number off a screen or hears it over the counter.
     */
    public function guests(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $query = trim((string) $request->query('q', ''));
        $digits = app(PosCustomerResolver::class)->digits($query);

        $rows = User::query()
            ->where('tenant_id', $tenantId)
            ->when($query !== '', function ($w) use ($query, $digits): void {
                $like = '%'.$query.'%';
                $w->where(function ($x) use ($like, $digits): void {
                    $x->where('name', 'like', $like)->orWhere('email', 'like', $like);
                    if ($digits !== '') {
                        // Match the tail, so `0912…`, `+98912…` and `۰۹۱۲…`-typed-with-Latin-
                        // digits all land on the same person. LIKE '%…%' is portable across
                        // MySQL and the SQLite the test suite runs on; RIGHT()/REPLACE() are not.
                        $x->orWhere('phone', 'like', '%'.substr($digits, -10).'%');
                    }
                });
            })
            ->orderBy('name')
            ->limit(12)
            ->get(['id', 'name', 'phone', 'email', 'loyalty_points']);

        // The guest's tier, not just their balance: a cashier choosing between two regulars is
        // choosing between a silver and a gold, and "12,400 points" does not say which.
        $tiers = app(\App\Services\Shop\LoyaltyTiers::class);

        return response()->json([
            'data' => $rows->map(function (User $user) use ($tenantId, $tiers): array {
                $tier = $tiers->forUser($tenantId, (int) $user->id);

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'phone' => $user->phone,
                    'email' => $user->email,
                    'points' => (int) $user->loyalty_points,
                    'tier' => [
                        'key' => $tier['key'],
                        'label_fa' => $tier['label_fa'],
                        'label_en' => $tier['label_en'],
                        'next' => $tier['next'],
                    ],
                ];
            })->all(),
        ]);
    }

    /**
     * The whole café catalogue with its add-ons and this branch's prices.
     *
     * @return list<array<string, mixed>>
     */
    private function catalogue(int $tenantId, ?int $branchId): array
    {
        $products = Product::query()
            ->where('tenant_id', $tenantId)
            // `is_hidden` is the catalogue's own "do not sell this" flag; a hidden product must
            // not reach a till even when somebody left it published.
            ->where('status', 'publish')
            ->where('is_hidden', false)
            ->with([
                'variants:id,product_id,name,price_minor,sort_order',
                'modifiers.options',
                'category:id,name',
                'branchPrices',
            ])
            ->orderBy('name')
            ->limit(500)
            ->get();

        return $products->map(function (Product $product) use ($branchId): array {
            // Why this item cannot be sold right now, or null when it can.
            //
            // The till used to answer `available => true` for everything and skip the sold-out
            // flag entirely: a dish marked 86 on the menu screen disappeared from the online
            // menu — `CafeOrdering` filters `is_sold_out` and `is_available` — and kept selling
            // at the counter. A counter that sells what the kitchen has run out of is the one
            // failure a POS must not have.
            //
            // The item is still returned (rather than dropped) so the cashier sees a greyed
            // button with a reason instead of wondering where the dish went.
            $unavailableBecause = match (true) {
                ! $product->is_available => 'unavailable',
                (bool) $product->is_sold_out => 'sold_out',
                $branchId !== null && ! $product->isAvailableAtBranch($branchId) => 'branch_off',
                default => null,
            };

            if ($unavailableBecause !== null) {
                return [
                    'id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'category' => $product->category?->name,
                    'price_minor' => $branchId !== null
                        ? $product->branchPriceMinor($branchId)
                        : $product->storefrontPriceMinor(),
                    'available' => false,
                    'unavailable_reason' => $unavailableBecause,
                    'variants' => [],
                    'modifiers' => [],
                ];
            }

            $price = $branchId !== null ? $product->branchPriceMinor($branchId) : $product->storefrontPriceMinor();

            return [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'category' => $product->category?->name,
                'price_minor' => $price,
                'available' => true,
                'unavailable_reason' => null,
                'variants' => $product->variants->map(fn ($variant): array => [
                    'id' => $variant->id,
                    'name' => $variant->name,
                    'price_minor' => $branchId !== null
                        ? $product->branchPriceMinor($branchId, $variant)
                        : (int) ($variant->price_minor ?: $product->price_minor),
                ])->values()->all(),
                'modifiers' => $product->modifiers->map(fn ($modifier): array => [
                    'id' => $modifier->id,
                    'name' => $modifier->name_fa,
                    'is_required' => (bool) $modifier->is_required,
                    'min_select' => (int) $modifier->min_select,
                    'max_select' => (int) $modifier->max_select,
                    'options' => $modifier->options->map(fn ($option): array => [
                        'id' => $option->id,
                        // Persian first: this is the name the cashier reads to the guest.
                        'name' => $option->name_fa,
                        'name_en' => $option->name_en,
                        'price_minor' => (int) $option->price_minor,
                        'is_addon' => (bool) $option->is_addon,
                        'is_default' => (bool) $option->is_default,
                    ])->values()->all(),
                ])->values()->all(),
            ];
        })->values()->all();
    }

    /**
     * Validation, then hand the payload to the service.
     *
     * Shape only: whether a table exists, whether a coupon is live, whether the points are
     * there — those are answered in the service against the database, in one place, so the
     * same rules apply to create and to edit.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'fulfillment' => [$partial ? 'sometimes' : 'required', 'string', Rule::in(OrderIntake::FULFILLMENTS)],
            'branch_id' => ['nullable', 'integer'],
            // Sent by an offline till, which wrote the drawer down while it still had a network.
            // Without it the replayed sale would be attributed to whatever shift is open when it
            // finally arrives — or to none.
            'shift_id' => ['nullable', 'integer'],
            'table_code' => ['nullable', 'string', 'max:32'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:32'],
            'customer_note' => ['nullable', 'string', 'max:1000'],
            'user_id' => ['nullable', 'integer'],
            'delivery_address' => ['nullable', 'string', 'max:500'],
            'delivery_zone_id' => ['nullable', 'integer'],
            'delivery_eta_minutes' => ['nullable', 'integer', 'min:0', 'max:240'],

            'items' => [$partial ? 'sometimes' : 'required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.product_variant_id' => ['nullable', 'integer'],
            'items.*.quantity' => ['nullable', 'integer', 'min:1', 'max:999'],
            'items.*.modifier_option_ids' => ['nullable', 'array'],
            'items.*.modifier_option_ids.*' => ['integer'],
            'items.*.note' => ['nullable', 'string', 'max:200'],

            'discount_type' => ['nullable', 'string', Rule::in(OrderIntake::DISCOUNT_TYPES)],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_minor' => ['nullable', 'integer', 'min:0'],
            'coupon_code' => ['nullable', 'string', 'max:64'],
            'loyalty_points' => ['nullable', 'integer', 'min:0'],

            'shipping_minor' => ['nullable', 'integer', 'min:0'],

            'payments' => ['nullable', 'array', 'max:6'],
            'payments.*.tender' => ['required_with:payments', 'string', Rule::in(OrderPayments::TENDERS)],
            'payments.*.amount_minor' => ['required_with:payments', 'integer', 'min:0'],
            'payments.*.received_minor' => ['nullable', 'integer', 'min:0'],
            'payments.*.reference' => ['nullable', 'string', 'max:120'],

            // Set by the till's offline queue; unique per tenant, so a replay is idempotent.
            'client_ref' => ['nullable', 'string', 'max:64'],

            // Pager service: the guest waits for it to buzz instead of sitting at a table.
            'pager_number' => ['nullable', 'string', 'max:16'],
        ]);
    }

    /**
     * The order as the till list needs it.
     *
     * Deliberately not `$order->toArray()`: that ships every column including the frozen
     * meta of every marketplace sync, and the till only ever reads these fields.
     *
     * @return array<string, mixed>
     */
    private function present(Order $order): array
    {
        return [
            'id' => $order->id,
            'number' => $order->number,
            'status' => $order->status,
            'subtotal_minor' => (int) $order->subtotal_minor,
            'discount_minor' => (int) $order->discount_minor,
            'shipping_minor' => (int) $order->shipping_minor,
            'total_minor' => (int) $order->total_minor,
            'amount_paid_minor' => $order->amount_paid_minor === null ? null : (int) $order->amount_paid_minor,
            'paid' => $order->paid_at !== null || in_array((string) $order->status, ['paid', 'completed'], true),
            'branch' => $order->relationLoaded('branch') && $order->branch
                ? ['id' => $order->branch->id, 'name' => $order->branch->name_fa]
                : null,
            'customer_name' => $order->customer_name,
            'customer_phone' => $order->customer_phone,
            'customer_note' => $order->customer_note,
            'created_at' => $order->created_at?->toIso8601String(),
            'items' => $order->relationLoaded('items')
                ? $order->items->map(fn ($item): array => [
                    'id' => $item->id,
                    'product_id' => $item->product_id,
                    'name' => $item->product_name,
                    'quantity' => (int) $item->quantity,
                    'unit_price_minor' => (int) $item->unit_price_minor,
                    'line_total_minor' => (int) $item->unit_price_minor * (int) $item->quantity,
                    'note' => is_array($item->meta) ? ($item->meta['note'] ?? null) : null,
                    'modifiers' => $item->relationLoaded('modifiers')
                        ? $item->modifiers->map(fn ($modifier): array => [
                            'name' => $modifier->name,
                            'price_delta_minor' => (int) $modifier->price_delta_minor,
                        ])->values()->all()
                        : [],
                ])->values()->all()
                : [],
            'payments' => $order->relationLoaded('payments')
                ? $this->payments->forOrder($order)
                : [],
        ];
    }
}
