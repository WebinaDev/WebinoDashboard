<?php

namespace App\Services\Membership;

use App\Services\Modules\ModuleSettingsService;

/**
 * Premium membership settings per tenant: on/off, shop discount for members, free download
 * quota for normal users and the feature rows of the plans comparison table.
 */
class MembershipSettings
{
    public const MODULE = 'membership';

    public const KEY = 'settings';

    public const PERIODS = ['lifetime', 'month'];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'discount_percent' => 10,
            'downloads' => ['free_audio' => 5, 'free_video' => 0, 'period' => 'lifetime'],
            'staff_full_access' => true,
            'features' => [],
        ];
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        return self::sanitize($this->settings->get($tenantId, self::MODULE, self::KEY, []));
    }

    /** @param array<string, mixed> $input */
    public function put(int $tenantId, array $input): array
    {
        $merged = array_replace_recursive($this->get($tenantId), $input);
        if (array_key_exists('features', $input)) {
            $merged['features'] = $input['features'];
        }
        $clean = self::sanitize($merged);
        $this->settings->put($tenantId, self::MODULE, self::KEY, $clean);

        return $clean;
    }

    /** @param array<string, mixed> $raw */
    public static function sanitize(array $raw): array
    {
        $d = self::defaults();
        $dl = is_array($raw['downloads'] ?? null) ? $raw['downloads'] : [];
        $features = [];
        foreach (array_values(is_array($raw['features'] ?? null) ? $raw['features'] : []) as $i => $row) {
            if (! is_array($row) || trim((string) ($row['label'] ?? '')) === '') {
                continue;
            }
            $features[] = [
                'key' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($row['key'] ?? ''))) ?: 'f'.($i + 1),
                'label' => mb_substr(trim((string) $row['label']), 0, 160),
                'free' => self::cell($row['free'] ?? false),
                'premium' => self::cell($row['premium'] ?? true),
                'sort' => (int) ($row['sort'] ?? $i),
            ];
        }
        usort($features, fn ($a, $b) => $a['sort'] <=> $b['sort']);

        return [
            'enabled' => (bool) ($raw['enabled'] ?? $d['enabled']),
            'discount_percent' => max(0, min(100, (float) ($raw['discount_percent'] ?? $d['discount_percent']))),
            'downloads' => [
                'free_audio' => max(0, (int) ($dl['free_audio'] ?? $d['downloads']['free_audio'])),
                'free_video' => max(0, (int) ($dl['free_video'] ?? $d['downloads']['free_video'])),
                'period' => in_array($dl['period'] ?? null, self::PERIODS, true) ? $dl['period'] : $d['downloads']['period'],
            ],
            'staff_full_access' => (bool) ($raw['staff_full_access'] ?? $d['staff_full_access']),
            'features' => $features,
        ];
    }

    /** A comparison cell: true / false (tick or cross) or a short text such as «۵ صوت». */
    private static function cell(mixed $v): bool|string
    {
        if (is_bool($v) || $v === null) {
            return (bool) $v;
        }
        if (in_array($v, [0, 1, '0', '1', 'true', 'false'], true)) {
            return in_array($v, [1, '1', 'true'], true);
        }

        return mb_substr(trim((string) $v), 0, 120);
    }
}
