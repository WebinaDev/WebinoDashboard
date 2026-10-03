<?php

namespace App\Services\Cafe;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductModifierOption;
use App\Models\ProductVariant;
use App\Services\Modules\ModuleSettingsService;
use Carbon\Carbon;
use Carbon\CarbonInterface;

class CafeOrdering
{
    public function __construct(private ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function menu(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());

        return array_merge(ModuleSettingsService::cafeMenuDefaults(), is_array($stored) ? $stored : []);
    }

    /** @return array<string, mixed> */
    public function hours(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());

        return array_merge(ModuleSettingsService::cafeHoursDefaults(), is_array($stored) ? $stored : []);
    }

    /** @return array<string, mixed> */
    public function publicStatus(int $tenantId): array
    {
        $hours = $this->hours($tenantId);
        $menu = $this->menu($tenantId);
        $now = Carbon::now($this->timezone($hours));
        $open = self::openAt($hours, $now);
        $limitReached = $this->limitReached($tenantId, $menu, $now);
        $block = (bool) ($menu['block_orders_when_closed'] ?? true);
        $accepting = ! $limitReached && (! $block || $open['is_open'] !== false);

        return [
            'is_open' => $open['is_open'],
            'reason' => $limitReached ? 'limit' : $open['reason'],
            'accepting_orders' => $accepting,
            'prep_minutes' => max(0, (int) ($menu['prep_minutes'] ?? 20)),
            'packaging_fee_minor' => max(0, (int) ($menu['packaging_fee_minor'] ?? 0)),
            'delivery_fee_minor' => max(0, (int) ($menu['delivery_fee_minor'] ?? 0)),
            'free_delivery_threshold_minor' => max(0, (int) ($menu['free_delivery_threshold_minor'] ?? 0)),
            'fulfillment' => [
                'dine_in' => (bool) ($menu['fulfillment_dine_in'] ?? true),
                'pickup' => (bool) ($menu['fulfillment_pickup'] ?? true),
                'delivery' => (bool) ($menu['fulfillment_delivery'] ?? false),
            ],
            'max_orders_per_day' => isset($menu['max_orders_per_day']) && $menu['max_orders_per_day'] !== ''
                ? (int) $menu['max_orders_per_day']
                : null,
            'timezone' => $this->timezone($hours),
        ];
    }

    public function assertAccepting(int $tenantId): void
    {
        $status = $this->publicStatus($tenantId);
        if ($status['accepting_orders']) {
            return;
        }

        $key = ($status['reason'] ?? '') === 'limit' ? 'api.cafe_order_limit' : 'api.cafe_closed';
        abort(response()->json([
            'message' => __($key),
            'errors' => ['code' => [$status['reason'] ?? 'closed']],
        ], 422));
    }

    /**
     * Recompute a line from stored catalog prices. Client prices are ignored.
     *
     * @param  list<int>  $optionIds
     * @return array{unit_minor: int, line_key: string, selections: list<array<string, mixed>>, variant_id: int|null}
     */
    public function priceLine(Product $product, array $optionIds, ?int $variantId): array
    {
        $optionIds = array_values(array_unique(array_map('intval', $optionIds)));
        sort($optionIds);

        $options = $optionIds === []
            ? collect()
            : ProductModifierOption::query()
                ->whereIn('id', $optionIds)
                ->whereHas('modifier', fn ($q) => $q->where('product_id', $product->id))
                ->with('modifier')
                ->get();

        if ($options->count() !== count($optionIds)) {
            abort(response()->json(['message' => __('api.cafe_modifier_invalid')], 422));
        }

        $byModifier = $options->groupBy('modifier_id');
        foreach ($product->modifiers()->get() as $mod) {
            $count = $byModifier->get($mod->id, collect())->count();
            $min = $mod->is_required ? max(1, (int) $mod->min_select) : (int) $mod->min_select;
            $max = max(1, (int) $mod->max_select);
            if ($count < $min || $count > $max) {
                abort(response()->json(['message' => __('api.cafe_modifier_required')], 422));
            }
        }

        $variant = null;
        if ($variantId) {
            $variant = ProductVariant::query()->where('product_id', $product->id)->whereKey($variantId)->first();
            if (! $variant) {
                abort(response()->json(['message' => __('api.cafe_modifier_invalid')], 422));
            }
        }

        $base = $product->storefrontPriceMinor($variant);
        $extra = (int) $options->sum('price_minor');
        $key = ($variant ? 'v'.$variant->id : 'base').($optionIds !== [] ? '-'.implode('.', $optionIds) : '');

        return [
            'unit_minor' => $base + $extra,
            'line_key' => substr($key, 0, 40),
            'variant_id' => $variant?->id,
            'selections' => $options->map(fn ($o) => [
                'option_id' => $o->id,
                'modifier_id' => $o->modifier_id,
                'name_fa' => $o->name_fa,
                'name_en' => $o->name_en,
                'price_minor' => (int) $o->price_minor,
            ])->values()->all(),
        ];
    }

    public function shippingMinor(int $tenantId, string $fulfillment, int $subtotal): int
    {
        $status = $this->publicStatus($tenantId);
        $packaging = (int) $status['packaging_fee_minor'];
        $delivery = 0;
        if ($fulfillment === 'delivery') {
            $threshold = (int) $status['free_delivery_threshold_minor'];
            $delivery = ($threshold > 0 && $subtotal >= $threshold) ? 0 : (int) $status['delivery_fee_minor'];
        }

        return $packaging + $delivery;
    }

    /**
     * @param  array<string, mixed>  $hours
     * @return array{is_open: bool|null, reason: string|null}
     */
    public static function openAt(array $hours, CarbonInterface $now): array
    {
        $tz = self::safeTimezone(isset($hours['timezone']) ? (string) $hours['timezone'] : null);
        $local = Carbon::parse($now)->timezone($tz);
        $closedDates = is_array($hours['closed_dates'] ?? null) ? $hours['closed_dates'] : [];
        if (in_array($local->toDateString(), $closedDates, true)) {
            return ['is_open' => false, 'reason' => 'holiday'];
        }

        $days = is_array($hours['days'] ?? null) ? $hours['days'] : [];
        if ($days === []) {
            return ['is_open' => null, 'reason' => null];
        }

        $key = strtolower($local->format('l'));
        $today = null;
        foreach ($days as $day) {
            if (! is_array($day)) {
                continue;
            }
            if (self::dayKey((string) ($day['day'] ?? '')) === $key) {
                $today = $day;
                break;
            }
        }
        $mins = ((int) $local->format('H')) * 60 + (int) $local->format('i');
        $isOpen = false;
        $known = $today !== null;
        if ($today !== null && empty($today['closed'])) {
            $open = self::clockMinutes((string) ($today['open'] ?? ''));
            $close = self::clockMinutes((string) ($today['close'] ?? ''));
            if ($open !== null && $close !== null) {
                $isOpen = $close >= $open
                    ? ($mins >= $open && $mins <= $close)
                    : ($mins >= $open || $mins <= $close);
            }
        }

        if (! $isOpen) {
            $yesterdayKey = strtolower($local->copy()->subDay()->format('l'));
            foreach ($days as $day) {
                if (! is_array($day) || self::dayKey((string) ($day['day'] ?? '')) !== $yesterdayKey) {
                    continue;
                }
                $known = true;
                $yOpen = self::clockMinutes((string) ($day['open'] ?? ''));
                $yClose = self::clockMinutes((string) ($day['close'] ?? ''));
                if ($yOpen !== null && $yClose !== null && $yClose < $yOpen && $mins <= $yClose && empty($day['closed'])) {
                    $isOpen = true;
                }
            }
        }

        if (! $known) {
            return ['is_open' => null, 'reason' => null];
        }

        return ['is_open' => $isOpen, 'reason' => $isOpen ? null : 'hours'];
    }

    public static function dayKey(string $raw): ?string
    {
        $value = mb_strtolower(trim($raw));
        $value = str_replace(['ي', 'ك', '‌'], ['ی', 'ک', ''], $value);
        $map = [
            'sunday' => 'sunday', 'یکشنبه' => 'sunday',
            'monday' => 'monday', 'دوشنبه' => 'monday',
            'tuesday' => 'tuesday', 'سهشنبه' => 'tuesday', 'سه‌شنبه' => 'tuesday',
            'wednesday' => 'wednesday', 'چهارشنبه' => 'wednesday',
            'thursday' => 'thursday', 'پنجشنبه' => 'thursday', 'پنج‌شنبه' => 'thursday',
            'friday' => 'friday', 'جمعه' => 'friday',
            'saturday' => 'saturday', 'شنبه' => 'saturday',
        ];

        return $map[$value] ?? null;
    }

    /** @param  array<string, mixed>  $menu */
    private function limitReached(int $tenantId, array $menu, CarbonInterface $now): bool
    {
        $max = $menu['max_orders_per_day'] ?? null;
        if ($max === null || $max === '' || (int) $max <= 0) {
            return false;
        }
        $local = Carbon::parse($now);
        $count = Order::query()
            ->where('tenant_id', $tenantId)
            ->where('meta->source', 'guest_table')
            ->whereBetween('created_at', [$local->copy()->startOfDay(), $local->copy()->endOfDay()])
            ->count();

        return $count >= (int) $max;
    }

    /** @param  array<string, mixed>  $hours */
    private function timezone(array $hours): string
    {
        return self::safeTimezone(isset($hours['timezone']) ? (string) $hours['timezone'] : null);
    }

    private static function safeTimezone(?string $tz): string
    {
        if ($tz && in_array($tz, timezone_identifiers_list(), true)) {
            return $tz;
        }

        return 'Asia/Tehran';
    }

    private static function clockMinutes(string $clock): ?int
    {
        if (! preg_match('/^(\d{1,2}):(\d{2})$/', trim($clock), $m)) {
            return null;
        }
        $h = (int) $m[1];
        $min = (int) $m[2];
        if ($h > 23 || $min > 59) {
            return null;
        }

        return $h * 60 + $min;
    }
}
