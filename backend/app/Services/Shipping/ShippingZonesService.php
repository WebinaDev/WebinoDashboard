<?php

namespace App\Services\Shipping;

use App\Services\Modules\ModuleSettingsService;

/**
 * Tenant shipping zones, locations, and methods (flat / free / local pickup / tapin).
 */
class ShippingZonesService
{
    public const MODULE = 'shipping';

    public const SUB = 'zones_config';

    /** @var list<array{code: string, name: string}> */
    public const IR_STATES = [
        ['code' => 'IR:TE', 'name' => 'تهران'],
        ['code' => 'IR:AL', 'name' => 'البرز'],
        ['code' => 'IR:IS', 'name' => 'اصفهان'],
        ['code' => 'IR:FA', 'name' => 'فارس'],
        ['code' => 'IR:KV', 'name' => 'خراسان رضوی'],
        ['code' => 'IR:KZ', 'name' => 'خوزستان'],
        ['code' => 'IR:AE', 'name' => 'آذربایجان شرقی'],
        ['code' => 'IR:AW', 'name' => 'آذربایجان غربی'],
        ['code' => 'IR:MN', 'name' => 'مازندران'],
        ['code' => 'IR:GI', 'name' => 'گیلان'],
        ['code' => 'IR:GO', 'name' => 'گلستان'],
        ['code' => 'IR:QM', 'name' => 'قم'],
        ['code' => 'IR:QZ', 'name' => 'قزوین'],
        ['code' => 'IR:MK', 'name' => 'مرکزی'],
        ['code' => 'IR:HD', 'name' => 'همدان'],
        ['code' => 'IR:YA', 'name' => 'یزد'],
        ['code' => 'IR:KE', 'name' => 'کرمان'],
        ['code' => 'IR:BK', 'name' => 'کرمانشاه'],
        ['code' => 'IR:LO', 'name' => 'لرستان'],
        ['code' => 'IR:HG', 'name' => 'هرمزگان'],
        ['code' => 'IR:BU', 'name' => 'بوشهر'],
        ['code' => 'IR:SB', 'name' => 'سیستان و بلوچستان'],
        ['code' => 'IR:AR', 'name' => 'اردبیل'],
        ['code' => 'IR:ZA', 'name' => 'زنجان'],
        ['code' => 'IR:SM', 'name' => 'سمنان'],
        ['code' => 'IR:IL', 'name' => 'ایلام'],
        ['code' => 'IR:CM', 'name' => 'چهارمحال و بختیاری'],
        ['code' => 'IR:KB', 'name' => 'کهگیلویه و بویراحمد'],
        ['code' => 'IR:KD', 'name' => 'کردستان'],
        ['code' => 'IR:KS', 'name' => 'خراسان شمالی'],
        ['code' => 'IR:KJ', 'name' => 'خراسان جنوبی'],
    ];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        return [
            'global' => [
                'enable_shipping' => true,
                'default_method' => 'flat_rate',
                'free_shipping_min' => 0,
            ],
            'zones' => [],
            'next_zone_id' => 1,
            'next_method_id' => 1,
        ];
    }

    /** @return array<string, mixed> */
    public function getConfig(int $tenantId): array
    {
        return $this->settings->get($tenantId, self::MODULE, self::SUB, $this->defaults());
    }

    /** @param  array<string, mixed>  $config */
    public function putConfig(int $tenantId, array $config): array
    {
        return $this->settings->put($tenantId, self::MODULE, self::SUB, $config);
    }

    /** @return array{zones: list<array<string, mixed>>, global: array<string, mixed>, method_types: list<array<string, string>>, states: list<array{code: string, name: string}>} */
    public function list(int $tenantId): array
    {
        $cfg = $this->getConfig($tenantId);

        return [
            'zones' => array_values($cfg['zones'] ?? []),
            'global' => $cfg['global'] ?? $this->defaults()['global'],
            'method_types' => $this->methodTypes(),
            'states' => self::IR_STATES,
        ];
    }

    /**
     * @param  array<string, mixed>  $global
     * @return array<string, mixed>
     */
    public function saveGlobal(int $tenantId, array $global): array
    {
        $cfg = $this->getConfig($tenantId);
        $cfg['global'] = array_merge($cfg['global'] ?? [], [
            'enable_shipping' => (bool) ($global['enable_shipping'] ?? true),
            'default_method' => (string) ($global['default_method'] ?? 'flat_rate'),
            'free_shipping_min' => max(0, (int) ($global['free_shipping_min'] ?? 0)),
        ]);
        $this->putConfig($tenantId, $cfg);

        return $cfg['global'];
    }

    /** @return array<string, mixed> */
    public function createZone(int $tenantId, string $name): array
    {
        $cfg = $this->getConfig($tenantId);
        $id = (int) ($cfg['next_zone_id'] ?? 1);
        $zone = [
            'id' => $id,
            'name' => trim($name) !== '' ? trim($name) : 'Zone '.$id,
            'order' => count($cfg['zones'] ?? []),
            'locations' => [['type' => 'country', 'code' => 'IR']],
            'methods' => [],
        ];
        $cfg['zones'][] = $zone;
        $cfg['next_zone_id'] = $id + 1;
        $this->putConfig($tenantId, $cfg);

        return $zone;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>|null
     */
    public function updateZone(int $tenantId, int $zoneId, array $input): ?array
    {
        $cfg = $this->getConfig($tenantId);
        foreach ($cfg['zones'] as $i => $zone) {
            if ((int) ($zone['id'] ?? 0) !== $zoneId) {
                continue;
            }
            if (isset($input['name'])) {
                $cfg['zones'][$i]['name'] = trim((string) $input['name']);
            }
            if (isset($input['locations']) && is_array($input['locations'])) {
                $locs = [];
                foreach ($input['locations'] as $loc) {
                    if (! is_array($loc)) {
                        continue;
                    }
                    $type = (string) ($loc['type'] ?? '');
                    $code = (string) ($loc['code'] ?? '');
                    if ($type === '' || $code === '') {
                        continue;
                    }
                    $locs[] = ['type' => $type, 'code' => $code];
                }
                $cfg['zones'][$i]['locations'] = $locs;
            }
            $this->putConfig($tenantId, $cfg);

            return $cfg['zones'][$i];
        }

        return null;
    }

    public function deleteZone(int $tenantId, int $zoneId): bool
    {
        $cfg = $this->getConfig($tenantId);
        $before = count($cfg['zones'] ?? []);
        $cfg['zones'] = array_values(array_filter(
            $cfg['zones'] ?? [],
            fn ($z) => (int) ($z['id'] ?? 0) !== $zoneId
        ));
        $this->putConfig($tenantId, $cfg);

        return count($cfg['zones']) < $before;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function addMethod(int $tenantId, int $zoneId, string $methodId): ?array
    {
        $allowed = array_column($this->methodTypes(), 'id');
        if (! in_array($methodId, $allowed, true)) {
            abort(422, 'Unknown shipping method');
        }
        $cfg = $this->getConfig($tenantId);
        foreach ($cfg['zones'] as $i => $zone) {
            if ((int) ($zone['id'] ?? 0) !== $zoneId) {
                continue;
            }
            $instanceId = (int) ($cfg['next_method_id'] ?? 1);
            $titles = [
                'flat_rate' => 'نرخ ثابت',
                'free_shipping' => 'ارسال رایگان',
                'local_pickup' => 'تحویل حضوری',
                'tapin' => 'تاپین',
            ];
            $method = [
                'instance_id' => $instanceId,
                'method_id' => $methodId,
                'title' => $titles[$methodId] ?? $methodId,
                'enabled' => true,
                'settings' => $this->defaultMethodSettings($methodId),
            ];
            $cfg['zones'][$i]['methods'][] = $method;
            $cfg['next_method_id'] = $instanceId + 1;
            $this->putConfig($tenantId, $cfg);

            return $method;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>|null
     */
    public function updateMethod(int $tenantId, int $zoneId, int $instanceId, array $input): ?array
    {
        $cfg = $this->getConfig($tenantId);
        foreach ($cfg['zones'] as $zi => $zone) {
            if ((int) ($zone['id'] ?? 0) !== $zoneId) {
                continue;
            }
            foreach ($zone['methods'] ?? [] as $mi => $method) {
                if ((int) ($method['instance_id'] ?? 0) !== $instanceId) {
                    continue;
                }
                if (array_key_exists('enabled', $input)) {
                    $cfg['zones'][$zi]['methods'][$mi]['enabled'] = (bool) $input['enabled'];
                }
                if (isset($input['title'])) {
                    $cfg['zones'][$zi]['methods'][$mi]['title'] = (string) $input['title'];
                }
                if (isset($input['settings']) && is_array($input['settings'])) {
                    $cfg['zones'][$zi]['methods'][$mi]['settings'] = array_merge(
                        $method['settings'] ?? [],
                        $input['settings']
                    );
                }
                $this->putConfig($tenantId, $cfg);

                return $cfg['zones'][$zi]['methods'][$mi];
            }
        }

        return null;
    }

    public function deleteMethod(int $tenantId, int $zoneId, int $instanceId): bool
    {
        $cfg = $this->getConfig($tenantId);
        foreach ($cfg['zones'] as $zi => $zone) {
            if ((int) ($zone['id'] ?? 0) !== $zoneId) {
                continue;
            }
            $before = count($zone['methods'] ?? []);
            $cfg['zones'][$zi]['methods'] = array_values(array_filter(
                $zone['methods'] ?? [],
                fn ($m) => (int) ($m['instance_id'] ?? 0) !== $instanceId
            ));
            $this->putConfig($tenantId, $cfg);

            return count($cfg['zones'][$zi]['methods']) < $before;
        }

        return false;
    }

    public function hasConfiguredMethods(int $tenantId): bool
    {
        $cfg = $this->getConfig($tenantId);
        foreach ($cfg['zones'] ?? [] as $zone) {
            foreach ($zone['methods'] ?? [] as $method) {
                if (! empty($method['enabled'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /** @return list<string> */
    public function methodTitles(int $tenantId): array
    {
        $cfg = $this->getConfig($tenantId);
        $titles = [];
        foreach ($cfg['zones'] ?? [] as $zone) {
            foreach ($zone['methods'] ?? [] as $method) {
                $title = trim((string) ($method['title'] ?? $method['method_id'] ?? ''));
                if ($title !== '') {
                    $titles[] = $title;
                }
            }
        }

        return array_values(array_unique($titles));
    }

    /**
     * Match rates for checkout by province code (IR:XX) and optional postcode.
     *
     * @return list<array{instance_id: int, method_id: string, title: string, cost_minor: int, zone_id: int, service: string}>
     */
    public function quote(int $tenantId, ?string $stateCode, ?string $postcode, int $cartSubtotalMinor): array
    {
        $cfg = $this->getConfig($tenantId);
        $global = $cfg['global'] ?? [];
        if (empty($global['enable_shipping'])) {
            return [];
        }

        $matched = [];
        foreach ($cfg['zones'] ?? [] as $zone) {
            if (! $this->zoneMatches($zone, $stateCode, $postcode)) {
                continue;
            }
            foreach ($zone['methods'] ?? [] as $method) {
                if (empty($method['enabled'])) {
                    continue;
                }
                $cost = $this->methodCost($method, $cartSubtotalMinor, (int) ($global['free_shipping_min'] ?? 0));
                if ($cost === null) {
                    continue;
                }
                $matched[] = [
                    'instance_id' => (int) $method['instance_id'],
                    'method_id' => (string) $method['method_id'],
                    'title' => (string) ($method['title'] ?? $method['method_id']),
                    'cost_minor' => $cost,
                    'zone_id' => (int) $zone['id'],
                    'service' => (string) (($method['settings']['service'] ?? null) ?: 'pishtaz'),
                ];
            }
        }

        return $matched;
    }

    /** @return list<array{id: string, title: string, description: string}> */
    public function methodTypes(): array
    {
        return [
            ['id' => 'flat_rate', 'title' => 'نرخ ثابت', 'description' => 'هزینه ثابت ارسال'],
            ['id' => 'free_shipping', 'title' => 'ارسال رایگان', 'description' => 'با حداقل مبلغ سبد'],
            ['id' => 'local_pickup', 'title' => 'تحویل حضوری', 'description' => 'بدون هزینه ارسال'],
            ['id' => 'tapin', 'title' => 'تاپین', 'description' => 'نرخ از تاپین یا تعرفه محلی'],
        ];
    }

    /**
     * @param  array<string, mixed>  $zone
     */
    protected function zoneMatches(array $zone, ?string $stateCode, ?string $postcode): bool
    {
        $locs = $zone['locations'] ?? [];
        if ($locs === []) {
            return true;
        }
        $hasCountry = false;
        $states = [];
        $postcodes = [];
        foreach ($locs as $loc) {
            $type = (string) ($loc['type'] ?? '');
            $code = (string) ($loc['code'] ?? '');
            if ($type === 'country' && strtoupper($code) === 'IR') {
                $hasCountry = true;
            }
            if ($type === 'state') {
                $states[] = $code;
            }
            if ($type === 'postcode') {
                $postcodes[] = $code;
            }
        }
        if ($postcodes !== [] && $postcode) {
            foreach ($postcodes as $pc) {
                if ($pc === $postcode || str_starts_with($postcode, rtrim($pc, '*'))) {
                    return true;
                }
            }
        }
        if ($states !== []) {
            return $stateCode !== null && in_array($stateCode, $states, true);
        }

        return $hasCountry;
    }

    /**
     * @param  array<string, mixed>  $method
     */
    protected function methodCost(array $method, int $cartSubtotal, int $globalFreeMin): ?int
    {
        $settings = is_array($method['settings'] ?? null) ? $method['settings'] : [];
        $id = (string) ($method['method_id'] ?? '');

        return match ($id) {
            'local_pickup' => 0,
            'free_shipping' => $cartSubtotal >= max(
                (int) ($settings['min_amount'] ?? 0),
                $globalFreeMin
            ) ? 0 : null,
            'flat_rate' => max(0, (int) ($settings['cost'] ?? 0)),
            'tapin' => max(0, (int) ($settings['fallback_cost'] ?? $settings['cost'] ?? 0)),
            default => max(0, (int) ($settings['cost'] ?? 0)),
        };
    }

    /** @return array<string, mixed> */
    protected function defaultMethodSettings(string $methodId): array
    {
        return match ($methodId) {
            'flat_rate' => ['cost' => 0],
            'free_shipping' => ['min_amount' => 0],
            'local_pickup' => [],
            'tapin' => ['fallback_cost' => 0, 'service' => 'pishtaz'],
            default => [],
        };
    }
}
