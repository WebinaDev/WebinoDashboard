<?php

namespace App\Services\Cafe;

/**
 * Menu pricing for a cafe: turns what an item costs into what it should be sold for.
 *
 * The chain, per the cost sheet a cafe owner fills in:
 *
 *   base      = (ingredients + packaging) × (1 + waste%)
 *   full      = base + labour share + fixed-cost share
 *   pre-tax   = full ÷ (1 − target profit − platform commission)
 *   final     = pre-tax × (1 + VAT)
 *
 * Every input is a *share* (0.07 = 7%), and the denominator is guarded: profit +
 * commission must stay below 100% or the price would be infinite, so the residual is
 * clamped, which keeps a mistyped "90% profit, 18% commission" from producing nonsense.
 *
 * Nothing here touches the database. Callers pass plain numbers, which makes the service
 * safe to reuse from the admin API, the PDF/print sheets and unit tests alike.
 */
final class CafePricingCalculator
{
    /** Profit + commission may not consume the whole denominator; 2% is kept as headroom. */
    public const MIN_DENOMINATOR = 0.02;

    /** @var array<string, mixed> */
    private array $settings;

    /** @param array<string, mixed> $settings */
    public function __construct(array $settings = [])
    {
        $this->settings = self::mergeWithDefaults($settings);
    }

    public static function forTenant(int $tenantId, callable $settingsReader): self
    {
        return new self((array) $settingsReader($tenantId));
    }

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            // Food cost and packaging are usually entered in toman even when the catalog is
            // in rial; the calculator converts once, so a wrong unit cannot reach a product.
            'input_unit' => 'toman',
            'waste_percent' => 7,
            'target_profit_percent' => 22,
            'platform_commission_percent' => 18,
            'vat_percent' => 10,
            'default_packaging_minor' => 0,
            // Rounding mirrors PricingCalculator: a menu price should read 145,000 not 144,879.
            'round_enabled' => true,
            'round_to' => 1000,
            // Platform prices are often shown as the platform charges the guest; the cafe's
            // net is what matters, so the breakdown reports both.
            'delivery_packaging_extra_minor' => 0,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function mergeWithDefaults(array $overrides): array
    {
        $out = self::defaultSettings();
        foreach ($overrides as $key => $value) {
            if ($value !== null && array_key_exists($key, $out)) {
                $out[$key] = $value;
            }
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    /**
     * Price one item for the channels a cafe actually sells through.
     *
     * Costs are the *store unit* (toman by default) of the tenant, in whole numbers. The
     * returned `prices` map is keyed by channel so the UI can show a card per channel
     * instead of one number the staff then has to re-derive.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function calculate(array $input): array
    {
        $ingredients = max(0, (float) ($input['ingredient_cost'] ?? 0));
        $packaging = max(0, (float) ($input['packaging_cost'] ?? $this->settings['default_packaging_minor'] ?? 0));
        $labour = max(0, (float) ($input['labour_cost'] ?? 0));
        $fixed = max(0, (float) ($input['fixed_cost'] ?? 0));

        $waste = self::percent($input['waste_percent'] ?? $this->settings['waste_percent']);
        $profit = self::percent($input['target_profit_percent'] ?? $this->settings['target_profit_percent']);
        $commission = self::percent($input['platform_commission_percent'] ?? $this->settings['platform_commission_percent']);
        $vat = self::percent($input['vat_percent'] ?? $this->settings['vat_percent']);

        // Channel choice: dine-in has no commission, delivery platforms do, takeaway sits
        // in between (no commission, but packaging always applies).
        $isDelivery = (bool) ($input['is_delivery'] ?? false);
        $channelCommission = $isDelivery ? $commission : 0.0;

        // 1) Ingredients and packaging absorb the waste: a burnt shot is paid for by the cup.
        $wasteAmount = ($ingredients + $packaging) * $waste;
        $baseCost = $ingredients + $packaging + $wasteAmount;

        // 2) Full cost carries the overhead this item must pay for.
        $fullCost = $baseCost + $labour + $fixed;

        // 3) Margin-on-sale denominator. Clamped so extreme inputs stay finite.
        $denominator = 1.0 - $profit - $channelCommission;
        $denominatorClamped = false;
        if ($denominator < self::MIN_DENOMINATOR) {
            $denominator = self::MIN_DENOMINATOR;
            $denominatorClamped = true;
        }

        $priceBeforeVat = $fullCost / $denominator;
        $finalPrice = $priceBeforeVat * (1.0 + $vat);

        $price = $this->roundForMenu($finalPrice);
        $preVat = $this->roundForMenu($priceBeforeVat);

        // Counted back off the *rounded* price so the report matches the menu, not the formula.
        $vatAmount = $price - $this->roundForMenu($price / (1.0 + $vat));
        $platformCut = $isDelivery ? $price * $commission : 0.0;
        $netBeforeOverhead = $price - $vatAmount - $platformCut;
        $netAfterOverhead = $netBeforeOverhead - $fullCost;

        return [
            'channel' => $isDelivery ? 'delivery' : 'dine_in',
            'inputs' => [
                'ingredient_cost' => self::whole($ingredients),
                'packaging_cost' => self::whole($packaging),
                'labour_cost' => self::whole($labour),
                'fixed_cost' => self::whole($fixed),
                'waste_percent' => round($waste * 100, 2),
                'target_profit_percent' => round($profit * 100, 2),
                'platform_commission_percent' => round($commission * 100, 2),
                'vat_percent' => round($vat * 100, 2),
            ],
            'costs' => [
                'waste_minor' => self::whole($wasteAmount),
                'base_minor' => self::whole($baseCost),
                'full_minor' => self::whole($fullCost),
            ],
            'prices' => [
                // What the guest pays, and what that price is made of.
                'final_minor' => $price,
                'before_vat_minor' => $preVat,
                'vat_minor' => $vatAmount,
                'platform_cut_minor' => self::whole($platformCut),
                'net_minor' => self::whole($netAfterOverhead),
            ],
            'ratios' => [
                // Food-cost ratio is the number a cafe watches daily (target ≈ 25–33%).
                'food_cost_percent' => $price > 0
                    ? round((($ingredients + $packaging) / $price) * 100, 1)
                    : 0.0,
                'prime_cost_percent' => $price > 0
                    ? round((($fullCost) / $price) * 100, 1)
                    : 0.0,
                'gross_margin_percent' => $price > 0
                    ? round((($price - $vatAmount - $ingredients - $packaging - $wasteAmount) / $price) * 100, 1)
                    : 0.0,
                'net_margin_percent' => $price > 0
                    ? round(($netAfterOverhead / $price) * 100, 1)
                    : 0.0,
            ],
            'denominator_clamped' => $denominatorClamped,
            'breakdown' => $this->steps($ingredients, $packaging, $wasteAmount, $labour, $fixed, $profit, $channelCommission, $vat, $fullCost, $priceBeforeVat, $finalPrice, $price),
        ];
    }

    /**
     * The same item priced for every channel at once, so the page can show
     * «سالن / بیرون‌بر / اسنپ‌فود» side by side without recomputing by hand.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, array<string, mixed>>
     */
    public function compare(array $input): array
    {
        $out = [];
        foreach (['dine_in' => false, 'pickup' => false, 'delivery' => true] as $channel => $isDelivery) {
            $out[$channel] = $this->calculate(array_merge($input, [
                'is_delivery' => $isDelivery,
                // Takeaway must carry its box; dine-in usually does not.
                'packaging_cost' => $channel === 'dine_in'
                    ? (float) ($input['dine_in_packaging_cost'] ?? 0)
                    : (float) ($input['packaging_cost'] ?? 0),
            ]));
        }

        return $out;
    }

    /**
     * Labour and overhead per item, derived from the whole business. A cafe rarely knows
     * "labour per latte", but it does know its monthly payroll, rent and how many items it
     * sells — this turns those into the two per-item shares the formula needs.
     *
     * @return array{labour_cost: int, fixed_cost: int, monthly_items: int, labour_percent: float, fixed_percent: float}
     */
    public function allocateOverhead(
        float $monthlyLabour,
        float $monthlyFixed,
        int $monthlyItems,
    ): array {
        $items = max(1, $monthlyItems);

        return [
            'monthly_items' => $items,
            'labour_cost' => self::whole($monthlyLabour / $items),
            'fixed_cost' => self::whole($monthlyFixed / $items),
            // Share of revenue the overhead represents is only meaningful once prices exist,
            // so the caller reports it against whatever price it already has.
            'labour_percent' => 0.0,
            'fixed_percent' => 0.0,
        ];
    }

    /**
     * Suggested selling price for a *given* final price: what the guest would pay if the
     * cafe already knows its price and wants to know the margin. Used by the "reverse"
     * panel and by the menu page when a product already exists.
     *
     * @return array<string, mixed>
     */
    public function reverse(int $priceMinor, array $input): array
    {
        $ingredients = max(0, (float) ($input['ingredient_cost'] ?? 0));
        $packaging = max(0, (float) ($input['packaging_cost'] ?? 0));
        $labour = max(0, (float) ($input['labour_cost'] ?? 0));
        $fixed = max(0, (float) ($input['fixed_cost'] ?? 0));
        $waste = self::percent($input['waste_percent'] ?? $this->settings['waste_percent']);
        $vat = self::percent($input['vat_percent'] ?? $this->settings['vat_percent']);
        $commission = self::percent($input['platform_commission_percent'] ?? $this->settings['platform_commission_percent']);
        $isDelivery = (bool) ($input['is_delivery'] ?? false);

        $baseCost = ($ingredients + $packaging) * (1.0 + $waste);
        $fullCost = $baseCost + $labour + $fixed;
        $vatAmount = $priceMinor - ($priceMinor / (1.0 + $vat));
        $platformCut = $isDelivery ? $priceMinor * $commission : 0.0;
        $net = $priceMinor - $vatAmount - $platformCut - $fullCost;

        return [
            'price_minor' => $priceMinor,
            'vat_minor' => self::whole($vatAmount),
            'platform_cut_minor' => self::whole($platformCut),
            'full_cost_minor' => self::whole($fullCost),
            'net_minor' => self::whole($net),
            'net_margin_percent' => $priceMinor > 0 ? round(($net / $priceMinor) * 100, 1) : 0.0,
            'food_cost_percent' => $priceMinor > 0 ? round((($ingredients + $packaging) / $priceMinor) * 100, 1) : 0.0,
        ];
    }

    /**
     * Best price for a *target* food-cost ratio — the second school of menu costing, where
     * the cafe says "desserts must be 28% food cost" and lets the price follow.
     */
    public function fromFoodCostTarget(float $foodCost, float $targetPercent): int
    {
        $target = self::percent($targetPercent);
        if ($target <= 0) {
            return self::whole($foodCost);
        }

        return $this->roundForMenu($foodCost / $target);
    }

    /**
     * Human-readable derivation, so the page can show *why* a price is what it is.
     *
     * @return list<array{key: string, value_minor?: int, percent?: float, note?: string}>
     */
    private function steps(
        float $ingredients,
        float $packaging,
        float $wasteAmount,
        float $labour,
        float $fixed,
        float $profit,
        float $commission,
        float $vat,
        float $fullCost,
        float $beforeVat,
        float $withVat,
        int $rounded,
    ): array {
        return [
            ['key' => 'ingredients', 'value_minor' => self::whole($ingredients)],
            ['key' => 'packaging', 'value_minor' => self::whole($packaging)],
            ['key' => 'waste', 'value_minor' => self::whole($wasteAmount)],
            ['key' => 'labour', 'value_minor' => self::whole($labour)],
            ['key' => 'fixed', 'value_minor' => self::whole($fixed)],
            ['key' => 'full_cost', 'value_minor' => self::whole($fullCost)],
            ['key' => 'profit_share', 'percent' => round($profit * 100, 2)],
            ['key' => 'commission_share', 'percent' => round($commission * 100, 2)],
            ['key' => 'before_vat', 'value_minor' => self::whole($beforeVat)],
            ['key' => 'vat', 'percent' => round($vat * 100, 2)],
            ['key' => 'with_vat', 'value_minor' => self::whole($withVat)],
            ['key' => 'rounded', 'value_minor' => $rounded],
        ];
    }

    /** Accepts 7, 7.5, "7", "7%" and 0.07 alike; always returns a 0–1 share. */
    public static function percent(mixed $value): float
    {
        if (is_string($value)) {
            $value = str_replace(['%', '٪', '٬', ','], '', trim($value));
            $value = strtr($value, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']);
        }

        $number = (float) $value;
        if ($number < 0) {
            $number = 0.0;
        }

        // A share already expressed as 0–1 passes through untouched; anything above is a percent.
        return $number <= 1.0 ? $number : $number / 100.0;
    }

    private function roundForMenu(float $price): int
    {
        if (! ($this->settings['round_enabled'] ?? true)) {
            return self::whole($price);
        }

        $to = max(1, (int) ($this->settings['round_to'] ?? 1000));

        return (int) (round($price / $to) * $to);
    }

    private static function whole(float $value): int
    {
        return (int) round($value);
    }
}
