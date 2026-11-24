<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\StoreCurrency;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Entities\CafePriceSheet;
use Modules\Cafe\Services\CafePricingCalculator;

/**
 * «پیشنهاد قیمت آیتم‌ها» — the menu pricing calculator behind the admin page.
 *
 * The calculator is deliberately stateless for the live preview: every keystroke posts the
 * numbers and gets a full breakdown back, so what staff see is what the server would save.
 * Saving a sheet and applying a price are separate, explicit actions.
 */
class CafePriceCalculatorController extends Controller
{
    public function __construct(private readonly ModuleSettingsService $settings) {}

    /** Saved sheets, plus the tenant-wide defaults the page opens with. */
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;

        $sheets = CafePriceSheet::query()
            ->where('tenant_id', $tid)
            ->with(['product:id,name,price_minor,currency'])
            ->orderByDesc('updated_at')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => [
                'settings' => $this->calculator($tid)->settings(),
                'currency' => StoreCurrency::code($tid),
                'sheets' => $sheets,
            ],
        ]);
    }

    /** Live calculation. Nothing is persisted; this is the preview the page re-runs on edit. */
    public function calculate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $input = $this->validated($request);

        $calculator = $this->calculator($tid);

        return response()->json([
            'data' => [
                'dine_in' => $calculator->calculate(array_merge($input, ['is_delivery' => false])),
                'delivery' => $calculator->calculate(array_merge($input, ['is_delivery' => true])),
                'comparison' => $calculator->compare($input),
                'settings' => $calculator->settings(),
            ],
        ]);
    }

    /**
     * Turn monthly overhead into the two per-item shares the formula needs. A cafe knows its
     * payroll and rent, not "labour per latte", so the page asks for the numbers it has.
     */
    public function allocate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'monthly_labour' => ['required', 'numeric', 'min:0', 'max:100000000000'],
            'monthly_fixed' => ['required', 'numeric', 'min:0', 'max:100000000000'],
            'monthly_items' => ['required', 'integer', 'min:1', 'max:10000000'],
        ]);

        $calculator = $this->calculator($tid);
        $allocated = $calculator->allocateOverhead(
            (float) $data['monthly_labour'],
            (float) $data['monthly_fixed'],
            (int) $data['monthly_items'],
        );

        return response()->json([
            'data' => $allocated + [
                // With an average price the page can also show what share of revenue the
                // overhead eats — the number that says whether the menu is priced too low.
                'monthly_cost' => (int) round($allocated['labour_cost'] * $allocated['monthly_items']
                    + $allocated['fixed_cost'] * $allocated['monthly_items']),
            ],
        ]);
    }

    /** What a price the cafe already charges actually leaves behind. */
    public function reverse(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'price_minor' => ['required', 'integer', 'min:0', 'max:100000000000'],
        ] + $this->costRules());

        return response()->json([
            'data' => $this->calculator($tid)->reverse((int) $data['price_minor'], $data),
        ]);
    }

    /**
     * Save (or update) the cost sheet for an item. A product may have only one sheet, which
     * keeps "what does this item cost?" a single answer on the menu page.
     */
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'name' => ['nullable', 'string', 'max:160'],
            'apply_price' => ['nullable', 'boolean'],
            'apply_to' => ['nullable', 'string', 'in:dine_in,delivery'],
        ] + $this->costRules());

        $product = null;
        if (! empty($data['product_id'])) {
            $product = Product::query()
                ->where('tenant_id', $tid)
                ->find((int) $data['product_id']);
            abort_if($product === null, 404);
        }

        $calculator = $this->calculator($tid);
        $input = $this->normalised($data);
        $dineIn = $calculator->calculate(array_merge($input, ['is_delivery' => false]));
        $delivery = $calculator->calculate(array_merge($input, ['is_delivery' => true]));

        $sheet = DB::transaction(function () use ($tid, $product, $input, $dineIn, $delivery, $data) {
            $sheet = CafePriceSheet::query()->updateOrCreate(
                ['tenant_id' => $tid, 'product_id' => $product?->id],
                [
                    'name' => $data['name'] ?? $product?->name,
                    'ingredient_cost_minor' => $input['ingredient_cost'],
                    'packaging_cost_minor' => $input['packaging_cost'],
                    'labour_cost_minor' => $input['labour_cost'],
                    'fixed_cost_minor' => $input['fixed_cost'],
                    'waste_percent' => $input['waste_percent'],
                    'target_profit_percent' => $input['target_profit_percent'],
                    'platform_commission_percent' => $input['platform_commission_percent'],
                    'vat_percent' => $input['vat_percent'],
                    'suggested_dine_in_minor' => $dineIn['prices']['final_minor'],
                    'suggested_delivery_minor' => $delivery['prices']['final_minor'],
                    'breakdown' => ['dine_in' => $dineIn, 'delivery' => $delivery],
                ],
            );

            // Applying is opt-in: a cost sheet may be saved while the price is still undecided.
            if (! empty($data['apply_price']) && $product !== null) {
                abort_if($product->lock_price, 422, __('api.cafe_price_locked'));
                $channel = ($data['apply_to'] ?? 'dine_in') === 'delivery' ? $delivery : $dineIn;
                $product->price_minor = (int) $channel['prices']['final_minor'];
                $product->save();
                $sheet->applied_price_minor = $product->price_minor;
                $sheet->save();
            }

            return $sheet;
        });

        return response()->json([
            'data' => [
                'sheet' => $sheet->load('product:id,name,price_minor,currency'),
                'dine_in' => $dineIn,
                'delivery' => $delivery,
            ],
        ], 201);
    }

    public function destroy(Request $request, CafePriceSheet $sheet): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $request->user()->tenant_id !== (int) $sheet->tenant_id, 403);
        $sheet->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** Cost inputs shared by every write endpoint. Money is in the tenant's store unit. */
    private function costRules(): array
    {
        return [
            'ingredient_cost' => ['nullable', 'numeric', 'min:0', 'max:100000000000'],
            'packaging_cost' => ['nullable', 'numeric', 'min:0', 'max:100000000000'],
            'labour_cost' => ['nullable', 'numeric', 'min:0', 'max:100000000000'],
            'fixed_cost' => ['nullable', 'numeric', 'min:0', 'max:100000000000'],
            'waste_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'target_profit_percent' => ['nullable', 'numeric', 'min:0', 'max:99'],
            'platform_commission_percent' => ['nullable', 'numeric', 'min:0', 'max:60'],
            'vat_percent' => ['nullable', 'numeric', 'min:0', 'max:50'],
            'is_delivery' => ['nullable', 'boolean'],
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $this->normalised($request->validate($this->costRules()));
    }

    /**
     * Percentages arrive as the percent number the UI shows (7, 22, 18) and are stored on the
     * sheet the same way; the calculator converts them to shares itself.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalised(array $data): array
    {
        return [
            'ingredient_cost' => (float) ($data['ingredient_cost'] ?? 0),
            'packaging_cost' => (float) ($data['packaging_cost'] ?? 0),
            'labour_cost' => (float) ($data['labour_cost'] ?? 0),
            'fixed_cost' => (float) ($data['fixed_cost'] ?? 0),
            'waste_percent' => $data['waste_percent'] ?? null,
            'target_profit_percent' => $data['target_profit_percent'] ?? null,
            'platform_commission_percent' => $data['platform_commission_percent'] ?? null,
            'vat_percent' => $data['vat_percent'] ?? null,
            'is_delivery' => (bool) ($data['is_delivery'] ?? false),
        ];
    }

    /** Per-tenant defaults live in the cafe menu settings so every cafe prices its own way. */
    private function calculator(int $tenantId): CafePricingCalculator
    {
        $menu = $this->settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());
        $pricing = is_array($menu['pricing'] ?? null) ? $menu['pricing'] : [];

        return new CafePricingCalculator($pricing);
    }
}
