<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Services\Orders\BranchStockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Entities\CafeBranch;
use Modules\Cafe\Services\BranchSettings;

/**
 * Multi-branch operations: the settings switchboard, per-branch stock, and kitchen stations.
 *
 * Every query is tenant-scoped from the authenticated user, never from a request parameter,
 * so a branch id belonging to another tenant simply matches nothing.
 */
class BranchOperationsController extends Controller
{
    public function __construct(
        private readonly BranchSettings $settings,
        private readonly BranchStockService $stock,
    ) {}

    /** The switchboard: what mode this shop is in. */
    public function settingsShow(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'settings' => $this->settings->get($tenantId),
                'defaults' => BranchSettings::defaults(),
                'branches' => CafeBranch::query()
                    ->where('tenant_id', $tenantId)
                    ->orderBy('sort_order')
                    ->get(['id', 'name_fa', 'name_en', 'slug', 'is_active']),
            ],
        ]);
    }

    public function settingsUpdate(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'pricing_mode' => ['sometimes', 'string', Rule::in([BranchSettings::PRICING_SHARED, 'shared', 'per_branch'])],
            'stock_mode' => ['sometimes', 'string', Rule::in([BranchSettings::STOCK_PER_BRANCH, 'shared'])],
            'offline_sales' => ['sometimes', 'string', Rule::in([BranchSettings::OFFLINE_ALLOW_NEGATIVE, 'block', 'capped'])],
            'require_branch_selection' => ['sometimes', 'boolean'],
            'flag_oversold' => ['sometimes', 'boolean'],
            'require_station_for_kds' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['data' => $this->settings->put($tenantId, $data)]);
    }

    /**
     * Stock for one branch.
     *
     * Includes negative rows on purpose: those are the sales that went past what the shelf
     * held, and they are the reason someone needs to open this screen.
     */
    public function stockIndex(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'branch_id' => ['required', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
            'low_only' => ['sometimes', 'boolean'],
            'search' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        $query = BranchStock::query()
            ->where('tenant_id', $tenantId)
            ->where('branch_id', $data['branch_id'])
            ->with(['product:id,name,sku,manage_stock', 'variant:id,name']);

        if ($request->boolean('low_only')) {
            $query->where(function ($q): void {
                $q->where('quantity', '<', 0)
                    ->orWhereColumn('quantity', '<=', 'reorder_level');
            });
        }

        if (! empty($data['search'])) {
            $needle = '%'.$data['search'].'%';
            $query->whereHas('product', fn ($q) => $q->where('name', 'like', $needle)->orWhere('sku', 'like', $needle));
        }

        $rows = $query->orderBy('quantity')->limit(300)->get()->map(fn (BranchStock $row): array => [
            'id' => $row->id,
            'product_id' => $row->product_id,
            'product_variant_id' => $row->product_variant_id,
            'product_name' => $row->product?->name,
            'variant_name' => $row->variant?->name,
            'sku' => $row->product?->sku,
            'quantity' => $row->quantity,
            'reserved_quantity' => $row->reserved_quantity,
            'available' => $row->available(),
            'reorder_level' => $row->reorder_level,
            'is_negative' => $row->quantity < 0,
            'last_counted_at' => $row->last_counted_at?->toIso8601String(),
        ]);

        return response()->json(['data' => $rows]);
    }

    /** Absolute stock-take. Idempotent, so replaying it after an outage is safe. */
    public function stockCount(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'branch_id' => ['required', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('tenant_id', $tenantId)],
            'product_variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $tenantId)],
            'quantity' => ['required', 'integer'],
            'reorder_level' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        $row = $this->stock->recount(
            $tenantId,
            (int) $data['branch_id'],
            (int) $data['product_id'],
            isset($data['product_variant_id']) ? (int) $data['product_variant_id'] : null,
            (int) $data['quantity'],
        );

        if (array_key_exists('reorder_level', $data)) {
            $row->update(['reorder_level' => $data['reorder_level']]);
        }

        return response()->json(['data' => $row->fresh()]);
    }

    /** Set or clear a branch's price override for one item. */
    public function priceOverride(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'branch_id' => ['required', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('tenant_id', $tenantId)],
            'product_variant_id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('tenant_id', $tenantId)],
            'price_minor' => ['nullable', 'integer', 'min:0'],
            'sale_price_minor' => ['nullable', 'integer', 'min:0'],
            'is_available' => ['sometimes', 'boolean'],
        ]);

        $row = \App\Models\BranchProductPrice::query()->updateOrCreate(
            [
                'branch_id' => $data['branch_id'],
                'product_id' => $data['product_id'],
                'product_variant_id' => $data['product_variant_id'] ?? null,
            ],
            [
                'tenant_id' => $tenantId,
                'price_minor' => $data['price_minor'] ?? null,
                'sale_price_minor' => $data['sale_price_minor'] ?? null,
                'is_available' => $data['is_available'] ?? true,
            ],
        );

        return response()->json(['data' => $row->fresh()]);
    }

    /**
     * The overrides a branch currently has.
     *
     * The screen that sets these prices needs to show what is already set — otherwise an
     * owner cannot tell an overridden item from a catalogue one, or find the override they
     * want to clear. Delete-by-id existed but list did not, which is the wrong half.
     */
    public function priceOverrideIndex(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
        ]);

        $rows = \App\Models\BranchProductPrice::query()
            ->where('tenant_id', $tenantId)
            ->when(isset($data['branch_id']), fn ($q) => $q->where('branch_id', $data['branch_id']))
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** Clear an override, so the branch inherits the catalogue price again. */
    public function priceOverrideDestroy(Request $request, int $override): JsonResponse
    {
        $row = \App\Models\BranchProductPrice::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($override)
            ->firstOrFail();

        $row->delete();

        return response()->json([], 204);
    }

    public function stationsIndex(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $stations = KitchenStation::query()
            ->where('tenant_id', $tenantId)
            ->withCount(['stationProducts', 'users'])
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $stations]);
    }

    public function stationsStore(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'name_fa' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:64'],
            'kind' => ['sometimes', 'string', Rule::in([
                KitchenStation::KIND_KITCHEN,
                KitchenStation::KIND_BAR,
                KitchenStation::KIND_DESSERT,
                KitchenStation::KIND_PASS,
            ])],
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tenantId)],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $slug = $data['slug'] ?? \Illuminate\Support\Str::slug((string) ($data['name_en'] ?? $data['name_fa']));
        if ($slug === '') {
            $slug = 'station-'.substr(bin2hex(random_bytes(4)), 0, 6);
        }

        $station = KitchenStation::query()->create([
            'tenant_id' => $tenantId,
            'branch_id' => $data['branch_id'] ?? null,
            'name_fa' => $data['name_fa'],
            'name_en' => $data['name_en'] ?? null,
            'slug' => $slug,
            'kind' => $data['kind'] ?? KitchenStation::KIND_KITCHEN,
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $station], 201);
    }

    public function stationsUpdate(Request $request, KitchenStation $station): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $station->tenant_id, 403);

        $data = $request->validate([
            'name_fa' => ['sometimes', 'string', 'max:255'],
            'name_en' => ['sometimes', 'nullable', 'string', 'max:255'],
            'kind' => ['sometimes', 'string'],
            'branch_id' => ['sometimes', 'nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ]);

        $station->update($data);

        return response()->json(['data' => $station->fresh()]);
    }

    public function stationsDestroy(Request $request, KitchenStation $station): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $station->tenant_id, 403);
        $station->delete();

        return response()->json([], 204);
    }

    /** Route an item or a whole category to a station. */
    public function stationsAssign(Request $request, KitchenStation $station): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $station->tenant_id, 403);

        $data = $request->validate([
            'product_id' => ['nullable', 'integer', Rule::exists('products', 'id')->where('tenant_id', $station->tenant_id)],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $station->tenant_id)],
        ]);

        if (! empty($data['user_id'])) {
            $station->users()->syncWithoutDetaching([(int) $data['user_id']]);

            return response()->json(['data' => ['users' => $station->users()->pluck('users.id')]]);
        }

        if (empty($data['product_id']) && empty($data['category_id'])) {
            return response()->json(['message' => 'product_id or category_id is required'], 422);
        }

        \Modules\Cafe\Entities\StationProduct::query()->firstOrCreate([
            'station_id' => $station->id,
            'product_id' => $data['product_id'] ?? null,
            'category_id' => $data['category_id'] ?? null,
        ]);

        return response()->json(['data' => ['assigned' => true]]);
    }

    /** Remove a user from a station — the KDS stops showing that station's tickets. */
    public function stationsUnassignUser(Request $request, KitchenStation $station, int $user): JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $station->tenant_id, 403);
        $station->users()->detach($user);

        return response()->json([], 204);
    }

    /**
     * Orders that went past the branch's stock.
     *
     * This is the list that makes an offline oversell actionable instead of invisible.
     */
    public function oversoldIndex(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $rows = \App\Models\Order::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('stock_oversold_at')
            ->with(['branch:id,name_fa'])
            ->orderByDesc('stock_oversold_at')
            ->limit(200)
            ->get()
            ->map(fn (\App\Models\Order $order): array => [
                'id' => $order->id,
                'number' => $order->number,
                'branch' => $order->branch?->name_fa,
                'total_minor' => $order->total_minor,
                'stock_oversold_at' => $order->stock_oversold_at?->toIso8601String(),
                'created_at' => $order->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $rows]);
    }
}
