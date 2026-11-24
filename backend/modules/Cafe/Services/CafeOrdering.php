<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductModifierOption;
use App\Models\ProductVariant;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\StoreCurrency;
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
            'delivery_zones' => $this->deliveryZones($menu),
            'guest_otp_required' => (bool) ($menu['guest_otp_required'] ?? false),
            'kitchen_service_enabled' => (bool) ($menu['kitchen_service_enabled'] ?? false),
            'allergen_note' => [
                'fa' => $menu['allergen_note_fa'] ?? null,
                'en' => $menu['allergen_note_en'] ?? null,
            ],
            'pickup_address' => $this->pickupAddress($tenantId),
            'today' => $this->today($hours, $now),
            'weekday' => strtolower($now->format('l')),
        ];
    }

    /**
     * «غذای روز» — the weekday key and the ids of items promoted for it. The guest menu
     * highlights them; nothing is charged or hidden, so a cafe can change its dish by
     * editing the product, with no menu rebuild.
     *
     * @return array{weekday: string, date: string, product_ids: list<int>}
     */
    public function dishOfDay(int $tenantId, array $productIds = []): array
    {
        $hours = $this->hours($tenantId);
        $now = Carbon::now($this->timezone($hours));
        $weekday = strtolower($now->format('l'));
        $ids = array_values(array_map('intval', $productIds));
        if ($ids === []) {
            return ['weekday' => $weekday, 'date' => $now->toDateString(), 'product_ids' => []];
        }

        $matches = \App\Models\Product::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $ids)
            ->where('is_hidden', false)
            ->where('is_available', true)
            ->where('is_sold_out', false)
            ->get(['id', 'daily_dish'])
            ->filter(fn ($product) => in_array($weekday, (array) ($product->daily_dish ?? []), true))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        return ['weekday' => $weekday, 'date' => $now->toDateString(), 'product_ids' => $matches];
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
     * Named add-ons («افزودنی محصول» without a price): the guest types what the kitchen should
     * note — «شیر بادام», «بدون شکر», «سرو جدا». Stored as selections with a zero price so the
     * kitchen ticket and the order record read exactly like a paid modifier line.
     *
     * @param  list<string>  $labels
     * @return list<array{option_id: int|null, modifier_id: int|null, name_fa: string, name_en: string, price_minor: int, addon: bool}>
     */
    public function addonSelections(Product $product, array $labels): array
    {
        $allowed = self::addonOptionIdsStatic($product);
        $out = [];
        foreach (array_slice($labels, 0, 6) as $label) {
            $label = trim((string) $label);
            if ($label === '' || mb_strlen($label) > 60) {
                continue;
            }
            // A label that matches an add-on option keeps its id so the dashboard can report
            // the most requested extras; a free-text note stays text.
            $optionId = null;
            $modifierId = null;
            if ($product->relationLoaded('modifiers')) {
                foreach ($product->modifiers as $modifier) {
                    foreach ($modifier->options as $option) {
                        if ($option->is_addon && in_array((string) $option->name_fa, [$label], true)) {
                            $optionId = (int) $option->id;
                            $modifierId = (int) $modifier->id;
                            break 2;
                        }
                    }
                }
            }
            $out[] = [
                'option_id' => $optionId,
                'modifier_id' => $modifierId,
                'name_fa' => $label,
                'name_en' => $label,
                'price_minor' => 0,
                'addon' => true,
            ];
        }

        return $out;
    }

    /** @return list<int> */
    private static function addonOptionIdsStatic(Product $product): array
    {
        $ids = [];
        if (! $product->relationLoaded('modifiers')) {
            return $ids;
        }
        foreach ($product->modifiers as $modifier) {
            foreach ($modifier->options as $option) {
                if ($option->is_addon) {
                    $ids[] = (int) $option->id;
                }
            }
        }

        return $ids;
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

        $byModifier = $options->reject(fn ($o) => (bool) ($o->is_addon ?? false))->groupBy('modifier_id');
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
        // Add-ons are named extras: a free add-on option never changes the price.
        $extra = (int) $options->reject(fn ($o) => (bool) ($o->is_addon ?? false))->sum('price_minor');
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


    /**
     * Cafe menu fees are unstamped. Honor menu.currency when set; otherwise use the
     * dominant published product stamp so IRR cafe catalogs (bluecafe etc.) keep
     * delivery/packaging in the same unit as their items.
     */
    private function feeCurrency(int $tenantId): ?string
    {
        $menu = $this->menu($tenantId);
        $explicit = strtoupper(trim((string) ($menu['currency'] ?? '')));
        if ($explicit !== '') {
            return $explicit;
        }

        $codes = Product::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'publish')
            ->whereNotNull('currency')
            ->where('currency', '!=', '')
            ->select('currency')
            ->groupBy('currency')
            ->orderByRaw('count(*) desc')
            ->pluck('currency');

        return $codes->isNotEmpty() ? (string) $codes->first() : StoreCurrency::code($tenantId);
    }

    /** Packaging + delivery + service fee, following the menu settings. */
    public function shippingMinor(int $tenantId, string $fulfillment, int $subtotal, int $itemCount = 1): int
    {
        return $this->fees($tenantId, $fulfillment, $subtotal, $itemCount)['total_minor'];
    }

    /**
     * Distance-banded delivery fees. An empty list keeps the flat fee/radius behaviour.
     *
     * @param  array<string, mixed>  $menu
     * @return list<array{min_km: float, max_km: float, fee_minor: int, label_fa: string|null, label_en: string|null}>
     */
    private function deliveryZones(array $menu): array
    {
        $raw = is_array($menu['delivery_zones'] ?? null) ? $menu['delivery_zones'] : [];
        $out = [];
        foreach ($raw as $zone) {
            if (! is_array($zone) || ! is_numeric($zone['min_km'] ?? null) || ! is_numeric($zone['max_km'] ?? null)) {
                continue;
            }
            $min = max(0, (float) $zone['min_km']);
            $max = max($min, (float) $zone['max_km']);
            $out[] = [
                'min_km' => $min,
                'max_km' => $max,
                'fee_minor' => max(0, (int) ($zone['fee_minor'] ?? 0)),
                'label_fa' => isset($zone['label_fa']) ? (string) $zone['label_fa'] : null,
                'label_en' => isset($zone['label_en']) ? (string) $zone['label_en'] : null,
            ];
        }
        usort($out, fn ($a, $b) => $a['min_km'] <=> $b['min_km']);

        return $out;
    }

    /** Fee for a delivery at this distance; null when no zone covers it (out of range). */
    public function zoneFee(int $tenantId, float $km): ?int
    {
        $zones = $this->deliveryZones($this->menu($tenantId));
        if ($zones === []) {
            return null;
        }
        foreach ($zones as $zone) {
            if ($km >= $zone['min_km'] && $km < $zone['max_km']) {
                return (int) $zone['fee_minor'];
            }
            // The outermost band is inclusive on its far edge so its top value means "up to".
            if (abs($km - $zone['max_km']) < 0.0001) {
                return (int) $zone['fee_minor'];
            }
        }

        return null;
    }

    /** Outermost band in km, used as the delivery radius when zones are configured. */
    public function zonesMaxKm(int $tenantId): float
    {
        $zones = $this->deliveryZones($this->menu($tenantId));

        return $zones === [] ? 0.0 : (float) max(array_column($zones, 'max_km'));
    }

    /**
     * Fee breakdown for a guest order, read from the saved menu settings.
     *
     * @return array{packaging_minor: int, delivery_minor: int, service_minor: int, total_minor: int}
     */
    public function fees(int $tenantId, string $fulfillment, int $subtotal, int $itemCount = 1, ?float $distanceKm = null): array
    {
        $status = $this->publicStatus($tenantId);

        $feeCurrency = $this->feeCurrency($tenantId);
        $packaging = 0;
        if (! empty($status['packaging_applies'][$fulfillment])) {
            $packaging = StoreCurrency::toStore((int) $status['packaging_fee_minor'], $feeCurrency, $tenantId);
            if ($status['packaging_fee_mode'] === 'per_item') {
                $packaging *= max(0, $itemCount);
            }
        }

        $delivery = 0;
        if ($fulfillment === 'delivery') {
            $threshold = StoreCurrency::toStore((int) $status['free_delivery_threshold_minor'], $feeCurrency, $tenantId);
            $free = $threshold > 0 && $subtotal >= $threshold;
            $zoneFee = $distanceKm !== null ? $this->zoneFee($tenantId, max(0, $distanceKm)) : null;
            if (! $free) {
                $delivery = $zoneFee !== null
                    ? StoreCurrency::toStore($zoneFee, $feeCurrency, $tenantId)
                    : StoreCurrency::toStore((int) $status['delivery_fee_minor'], $feeCurrency, $tenantId);
            }
        }

        // Service fee: a percentage when set, otherwise a flat per-guest plate charge for a
        // served table (kitchen service). Percentage wins so existing cafés keep billing as before.
        $service = 0;
        $percent = (float) $status['service_fee_percent'];
        if ($percent > 0 && (! $status['service_fee_dine_in_only'] || $fulfillment === 'dine_in')) {
            $service = (int) round(max(0, $subtotal) * $percent / 100);
        } elseif (! empty($status['kitchen_service_enabled']) && $fulfillment === 'dine_in') {
            $menu = $this->menu($tenantId);
            $service = StoreCurrency::toStore(max(0, (int) ($menu['kitchen_service_fee_minor'] ?? 0)), $feeCurrency, $tenantId);
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
    public function quote(int $tenantId, string $fulfillment, array $lines, int $itemCount, ?float $distanceKm = null): array
    {
        $subtotal = 0;
        foreach ($lines as $line) {
            $subtotal += max(0, (int) $line['amount']);
        }
        $fees = $this->fees($tenantId, $fulfillment, $subtotal, $itemCount, $distanceKm);
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
        $hasTables = \Modules\Cafe\Entities\CafeTable::query()->where('tenant_id', $tenantId)->exists();
        if (! $hasTables) {
            return $code !== '' ? ['id' => null, 'code' => $code, 'label' => null, 'branch_slug' => null] : null;
        }
        $row = \Modules\Cafe\Entities\CafeTable::query()
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

    /** Where a pickup guest collects the order (venue address, then the first active branch). */
    public function pickupAddress(int $tenantId): ?string
    {
        $venue = $this->settings->get($tenantId, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults());
        $address = trim((string) ($venue['address_fa'] ?? ''));
        if ($address !== '') {
            return $address;
        }

        $branch = \Modules\Cafe\Entities\CafeBranch::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->first();
        $branchAddress = trim((string) ($branch?->address_fa ?? ''));

        return $branchAddress !== '' ? $branchAddress : null;
    }

    /**
     * Today's service window for the storefront header: the clock range, whether the kitchen
     * is open right now, and when it next opens (so «بسته است» can say «بازگشایی ۸:۳۰»).
     *
     * @param  array<string, mixed>  $hours
     * @return array{today_open: string|null, today_close: string|null, closed: bool, closes_soon: bool, next_open: array{day: string, at: string}|null}
     */
    private function today(array $hours, CarbonInterface $now): array
    {
        $tz = $this->timezone($hours);
        $local = Carbon::parse($now)->timezone($tz);
        $key = strtolower($local->format('l'));
        $days = is_array($hours['days'] ?? null) ? $hours['days'] : [];

        $row = null;
        foreach ($days as $day) {
            if (is_array($day) && self::dayKey((string) ($day['day'] ?? '')) === $key) {
                $row = $day;
                break;
            }
        }

        $closedToday = $row === null || ! empty($row['closed'])
            || in_array($local->toDateString(), is_array($hours['closed_dates'] ?? null) ? $hours['closed_dates'] : [], true);
        $open = $closedToday ? null : ($row['open'] ?? null);
        $close = $closedToday ? null : ($row['close'] ?? null);
        $isOpen = self::openAt($hours, $local)['is_open'];
        $closesSoon = false;
        if ($isOpen === true && is_string($close) && ($mins = self::clockMinutes($close)) !== null) {
            $nowMins = ((int) $local->format('H')) * 60 + (int) $local->format('i');
            $left = $mins - $nowMins;
            if ($left < 0) {
                $left += 24 * 60;
            }
            $closesSoon = $left <= 45;
        }

        return [
            'today_open' => $open !== null ? self::normalizeClock((string) $open) : null,
            'today_close' => $close !== null ? self::normalizeClock((string) $close) : null,
            'closed' => $isOpen === false,
            'closes_soon' => $closesSoon,
            'next_open' => $isOpen === true ? null : $this->nextOpening($hours, $local),
        ];
    }

    /**
     * First opening moment in the next 7 days, as a clock plus a localized day name so the
     * storefront can print «فردا ۹:۰۰» without shipping a Jalali calendar to the server.
     *
     * @param  array<string, mixed>  $hours
     * @return array{day: string, at: string}|null
     */
    public function nextOpening(array $hours, ?CarbonInterface $now = null): ?array
    {
        $tz = $this->timezone($hours);
        $cursor = Carbon::parse($now ?? Carbon::now())->timezone($tz)->copy()->addMinute();
        $days = is_array($hours['days'] ?? null) ? $hours['days'] : [];
        $closedDates = is_array($hours['closed_dates'] ?? null) ? $hours['closed_dates'] : [];

        for ($i = 0; $i < 7 * 24 * 60; $i += 15) {
            if (in_array($cursor->toDateString(), $closedDates, true)) {
                $cursor->addDay()->setTime(0, 0);
                continue;
            }
            if (self::openAt($hours, $cursor)['is_open'] === true) {
                return [
                    'day' => strtolower($cursor->format('l')),
                    'at' => $cursor->format('H:i'),
                    'date' => $cursor->toDateString(),
                ];
            }
            $cursor->addMinutes(15);
        }

        return null;
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
