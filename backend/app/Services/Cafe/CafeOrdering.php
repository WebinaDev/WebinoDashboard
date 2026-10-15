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
            'packaging_fee_mode' => ($menu['packaging_fee_mode'] ?? 'per_order') === 'per_item' ? 'per_item' : 'per_order',
            'packaging_applies' => [
                'dine_in' => (bool) ($menu['packaging_dine_in'] ?? false),
                'pickup' => (bool) ($menu['packaging_pickup'] ?? true),
                'delivery' => (bool) ($menu['packaging_delivery'] ?? true),
            ],
            'service_fee_percent' => min(100, max(0, (float) ($menu['service_fee_percent'] ?? 0))),
            'service_fee_dine_in_only' => (bool) ($menu['service_fee_dine_in_only'] ?? true),
            'payment_methods' => $this->paymentMethods($tenantId),
            'delivery_radius_km' => max(0, (float) ($menu['delivery_radius_km'] ?? 0)),
            'cafe_location' => is_numeric($menu['cafe_lat'] ?? null) && is_numeric($menu['cafe_lng'] ?? null)
                ? ['lat' => (float) $menu['cafe_lat'], 'lng' => (float) $menu['cafe_lng']]
                : null,
            'delivery_require_pin' => (bool) ($menu['delivery_require_pin'] ?? true),
            'pickup_slot_minutes' => max(5, (int) ($menu['pickup_slot_minutes'] ?? 15)),
            'dine_in_require_table' => (bool) ($menu['dine_in_require_table'] ?? true),
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

    /** Packaging + delivery + service fee, following the menu settings. */
    public function shippingMinor(int $tenantId, string $fulfillment, int $subtotal, int $itemCount = 1): int
    {
        return $this->fees($tenantId, $fulfillment, $subtotal, $itemCount)['total_minor'];
    }

    /**
     * Fee breakdown for a guest order, read from the saved menu settings.
     *
     * @return array{packaging_minor: int, delivery_minor: int, service_minor: int, total_minor: int}
     */
    public function fees(int $tenantId, string $fulfillment, int $subtotal, int $itemCount = 1): array
    {
        $status = $this->publicStatus($tenantId);

        $packaging = 0;
        if (! empty($status['packaging_applies'][$fulfillment])) {
            $packaging = (int) $status['packaging_fee_minor'];
            if ($status['packaging_fee_mode'] === 'per_item') {
                $packaging *= max(0, $itemCount);
            }
        }

        $delivery = 0;
        if ($fulfillment === 'delivery') {
            $threshold = (int) $status['free_delivery_threshold_minor'];
            $delivery = ($threshold > 0 && $subtotal >= $threshold) ? 0 : (int) $status['delivery_fee_minor'];
        }

        $service = 0;
        $percent = (float) $status['service_fee_percent'];
        if ($percent > 0 && (! $status['service_fee_dine_in_only'] || $fulfillment === 'dine_in')) {
            $service = (int) round(max(0, $subtotal) * $percent / 100);
        }

        return [
            'packaging_minor' => $packaging,
            'delivery_minor' => $delivery,
            'service_minor' => $service,
            'total_minor' => $packaging + $delivery + $service,
        ];
    }

    /**
     * Full server-side quote (fees + VAT) so cart, checkout and the order record agree.
     * Client prices are never used: callers pass line amounts recomputed from the catalog.
     *
     * @param  list<array{amount: int, taxable: bool}>  $lines
     * @return array<string, mixed>
     */
    public function quote(int $tenantId, string $fulfillment, array $lines, int $itemCount): array
    {
        $subtotal = 0;
        foreach ($lines as $line) {
            $subtotal += max(0, (int) $line['amount']);
        }
        $fees = $this->fees($tenantId, $fulfillment, $subtotal, $itemCount);
        $tax = \App\Services\Orders\OrderTax::computeLines($tenantId, $lines, $fees['total_minor']);
        $rate = (float) ($tax['lines'][0]['rate'] ?? 0);

        return $fees + [
            'fulfillment' => $fulfillment,
            'subtotal_minor' => $subtotal,
            'fees_minor' => $fees['total_minor'],
            'tax_minor' => $tax['tax_minor'],
            'tax_added_minor' => $tax['added_minor'],
            'tax_lines' => $tax['lines'],
            'vat_rate' => $rate,
            'vat_inclusive' => $tax['tax_minor'] > 0 && $tax['added_minor'] === 0,
            'show_vat' => \App\Services\Orders\OrderTax::showOnInvoice($tenantId),
            'grand_total_minor' => max(0, $subtotal + $fees['total_minor'] + $tax['added_minor']),
        ];
    }

    /**
     * Payment methods a guest can pick: enabled + configured online gateways (store gateway
     * settings) and, when allowed in cafe settings, cash / pay at counter.
     *
     * @return list<array{id: string, title: string, type: string}>
     */
    public function paymentMethods(int $tenantId, string $fulfillment = 'dine_in'): array
    {
        $menu = $this->menu($tenantId);
        $out = [];
        if ((bool) ($menu['pay_online_enabled'] ?? true)) {
            foreach (app(\App\Services\Payments\PaymentGatewaySettingsService::class)->checkoutGateways($tenantId, 'cash') as $gw) {
                $out[] = ['id' => (string) $gw['id'], 'title' => (string) $gw['title'], 'type' => 'online'];
            }
        }
        if ((bool) ($menu['pay_cash_enabled'] ?? true)) {
            $out[] = ['id' => 'cash', 'title' => '', 'type' => 'cash'];
        }

        return $out;
    }

    /**
     * Pickup slots from now + prep time, rounded up to the slot size, within opening hours
     * (per weekday, overnight ranges, holidays). Looks up to 24 hours ahead.
     *
     * @return list<array{time: string, at: string}>
     */
    public function pickupSlots(int $tenantId, ?CarbonInterface $now = null): array
    {
        $hours = $this->hours($tenantId);
        $menu = $this->menu($tenantId);
        $tz = $this->timezone($hours);
        $now = Carbon::parse($now ?? Carbon::now())->timezone($tz);
        $prep = max(0, (int) ($menu['prep_minutes'] ?? 20));
        $step = max(5, (int) ($menu['pickup_slot_minutes'] ?? 15));

        $start = $now->copy()->addMinutes($prep)->second(0);
        $mins = $start->hour * 60 + $start->minute;
        $start->setTime(0, 0)->addMinutes((int) (ceil($mins / $step) * $step));

        $out = [];
        $end = $now->copy()->addDay();
        for ($t = $start->copy(); $t->lt($end) && count($out) < 64; $t->addMinutes($step)) {
            if (self::openAt($hours, $t)['is_open'] === false) {
                continue;
            }
            $out[] = ['time' => $t->format('H:i'), 'at' => $t->toIso8601String()];
        }

        return $out;
    }

    /** Great-circle distance in km. */
    /**
     * Tables staff manage in the dashboard are the source of truth. When a cafe has none, any
     * typed table label is accepted (older setups); once tables exist only an active one is valid.
     *
     * @return array{id: int|null, code: string, label: string|null, branch_slug: string|null}|null
     */
    public function resolveTable(int $tenantId, ?string $code, ?int $id = null): ?array
    {
        $code = $code !== null ? trim($code) : '';
        if ($code === '' && ! $id) {
            return null;
        }
        $hasTables = \App\Models\CafeTable::query()->where('tenant_id', $tenantId)->exists();
        if (! $hasTables) {
            return $code !== '' ? ['id' => null, 'code' => $code, 'label' => null, 'branch_slug' => null] : null;
        }
        $row = \App\Models\CafeTable::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->when($id, fn ($q) => $q->whereKey($id), fn ($q) => $q->where('code', $code))
            ->with('branch:id,slug')
            ->first();
        if (! $row || ($id && $code !== '' && $row->code !== $code)) {
            return null;
        }

        return ['id' => (int) $row->id, 'code' => (string) $row->code, 'label' => $row->label, 'branch_slug' => $row->branch?->slug];
    }

    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($a)));
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
                // Half-open interval [open, close): closed at exactly the close minute.
                // close < open is an overnight range; the after-midnight part is
                // handled by yesterday's entry below. open == close (e.g. 00:00–00:00) is a
                // closed day, matching the public hours display; 00:00–24:00 means 24 hours.
                if ($open === $close) {
                    $isOpen = false;
                } elseif ($open === 0 && $close === 24 * 60) {
                    $isOpen = true;
                } elseif ($close > $open) {
                    $isOpen = $mins >= $open && $mins < $close;
                } else {
                    $isOpen = $mins >= $open;
                }
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
                if ($yOpen !== null && $yClose !== null && $yClose < $yOpen && $mins < $yClose && empty($day['closed'])) {
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

    /** Persian/Arabic digits and `٫`/`.` separators to ASCII `H:mm`. */
    public static function normalizeClock(string $clock): string
    {
        $clock = strtr(trim($clock), [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '٫' => ':', '.' => ':', '،' => ':',
        ]);

        return $clock;
    }

    private static function clockMinutes(string $clock): ?int
    {
        if (! preg_match('/^(\d{1,2}):(\d{2})$/', self::normalizeClock($clock), $m)) {
            return null;
        }
        $h = (int) $m[1];
        $min = (int) $m[2];
        // "24:00" is a valid close meaning end of day.
        if ($h === 24 && $min === 0) {
            return 24 * 60;
        }
        if ($h > 23 || $min > 59) {
            return null;
        }

        return $h * 60 + $min;
    }
}
