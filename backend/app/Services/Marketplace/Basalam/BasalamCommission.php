<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Throwable;

/**
 * Basalam category commission (port of CommissionRates + FetchCommission): local rates from the
 * bundled Mehr-1405 tariff or an uploaded CSV, matched to the category tree by name path, with the
 * core commission API as fallback.
 */
class BasalamCommission
{
    public const BUCKET = 'basalam.commission';

    public const MAX_PERCENT = 35;

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    /** @return array{rates: array<string, float>, paths: array<string, mixed>, imported_at: string, row_count: int, unmatched: int} */
    public function get(): array
    {
        $raw = $this->settings()->bucket($this->tid(), self::BUCKET);
        $rates = [];
        foreach ((array) ($raw['rates'] ?? []) as $id => $pct) {
            $rates[(string) $id] = (float) $pct;
        }

        return [
            'rates' => $rates,
            'paths' => (array) ($raw['paths'] ?? []),
            'imported_at' => (string) ($raw['imported_at'] ?? ''),
            'row_count' => (int) ($raw['row_count'] ?? count($rates)),
            'unmatched' => (int) ($raw['unmatched'] ?? 0),
        ];
    }

    /** Leaf-first lookup in the imported rates. */
    public function lookupPercent(array $categoryIds): float
    {
        $rates = $this->get()['rates'];
        if ($rates === []) {
            return 0.0;
        }
        for ($i = count($categoryIds) - 1; $i >= 0; $i--) {
            $key = (string) abs((int) $categoryIds[$i]);
            if ($key !== '0' && isset($rates[$key])) {
                return (float) $rates[$key];
            }
        }

        return 0.0;
    }

    /** Local rate, else GET core commission API by category levels (cached one day per chain). */
    public function percentFor(array $categoryIds): float
    {
        $ids = array_values(array_filter(array_map('intval', $categoryIds), fn ($v) => $v > 0));
        $local = $this->lookupPercent($ids);
        if ($local > 0 && $local < 100) {
            return $local;
        }
        if ($ids === []) {
            return 0.0;
        }
        $query = [];
        foreach ([0 => 'level1', 1 => 'level2', 2 => 'level3'] as $i => $level) {
            if (isset($ids[$i])) {
                $query['product.category.'.$level] = $ids[$i];
            }
        }

        return (float) cache()->remember('marketplace:basalam:commission:'.implode('-', $ids), 86400, function () use ($query) {
            try {
                $body = $this->client->get(BasalamEndpoints::COMMISSION, $query);
            } catch (MarketplaceException) {
                return 0.0;
            }

            return (float) (data_get($body, 'commission_data.commission_percent') ?? 0);
        });
    }

    /**
     * Gross-up multiplier 1/(1−pct), capped at +35% (WordPress PriceService::applyCommissionCalculation).
     */
    public function applyTo(float $price, array $categoryIds): float
    {
        $pct = $this->percentFor($categoryIds);
        if ($pct <= 0 || $pct >= 100) {
            return $price;
        }
        $multiplier = 1 / (1 - $pct / 100);
        $max = 1 + self::MAX_PERCENT / 100;
        if ($multiplier > $max) {
            MarketplaceLogger::warning($this->tid(), 'basalam', 'product', 'کارمزد دسته‌بندی باسلام خارج از بازه منطقی بود و افزایش قیمت به سقف مجاز محدود شد.', [
                'category_ids' => $categoryIds, 'commission_percent' => $pct, 'max_percent' => self::MAX_PERCENT,
            ]);
            $multiplier = $max;
        }

        return $price * $multiplier;
    }

    // ── Import ──────────────────────────────────────────────────────────

    /** @return array{ok: bool, message: string, matched: int, unmatched: int, row_count: int} */
    public function importCsv(string $csv, bool $enableCommission = true): array
    {
        if (str_starts_with($csv, "\xEF\xBB\xBF")) {
            $csv = substr($csv, 3);
        }
        if (trim($csv) === '') {
            return self::fail('empty_csv');
        }
        $rows = self::parseCsvRows($csv);
        if ($rows === []) {
            return self::fail('no_rows');
        }

        return $this->importRows($rows, $enableCommission);
    }

    public function seedFromBundledTariff(bool $enableCommission = true): array
    {
        $path = resource_path('data/basalam/mehr-1405-commission-tariff.php');
        if (! is_readable($path)) {
            return self::fail('tariff_file_missing');
        }
        $raw = include $path;
        $rows = [];
        foreach (is_array($raw) ? $raw : [] as $row) {
            if (! is_array($row) || count($row) < 4) {
                continue;
            }
            $l1 = trim((string) $row[0]);
            $pct = (float) $row[3];
            if ($l1 === '' || $pct <= 0 || $pct >= 100) {
                continue;
            }
            $rows[] = ['l1' => $l1, 'l2' => trim((string) $row[1]), 'l3' => trim((string) $row[2]), 'percent' => $pct];
        }
        if ($rows === []) {
            return self::fail('tariff_empty');
        }

        return $this->importRows($rows, $enableCommission);
    }

    /** @param  list<array{l1: string, l2: string, l3: string, percent: float}>  $rows */
    public function importRows(array $rows, bool $enableCommission = true): array
    {
        try {
            $tree = BasalamCategories::for($this->tid())->tree();
        } catch (Throwable $e) {
            MarketplaceLogger::error($this->tid(), 'basalam', 'commission', 'commission import: categories fetch failed: '.$e->getMessage());

            return self::fail('categories_fetch_failed');
        }
        $index = self::buildNameIndex($tree);
        $rates = [];
        $paths = [];
        $matched = 0;
        $unmatched = 0;
        foreach ($rows as $row) {
            $pct = (float) ($row['percent'] ?? 0);
            if ($pct <= 0 || $pct >= 100) {
                $unmatched++;

                continue;
            }
            $hit = self::resolvePath($index, (string) ($row['l1'] ?? ''), (string) ($row['l2'] ?? ''), (string) ($row['l3'] ?? ''));
            if ($hit === null) {
                $unmatched++;

                continue;
            }
            $leaf = (string) $hit['leaf_id'];
            $rates[$leaf] = $pct;
            $paths[$leaf] = ['level1' => $row['l1'] ?? '', 'level2' => $row['l2'] ?? '', 'level3' => $row['l3'] ?? '', 'ids' => $hit['ids'], 'percent' => $pct];
            $matched++;
        }
        $this->settings()->putBucket($this->tid(), self::BUCKET, [
            'rates' => $rates,
            'paths' => $paths,
            'imported_at' => gmdate('c'),
            'row_count' => $matched,
            'unmatched' => $unmatched,
        ]);
        if ($enableCommission && $matched > 0) {
            (new BasalamSettings($this->settings()))->saveEngine($this->tid(), ['price_change_value' => BasalamSettings::COMMISSION]);
        }
        MarketplaceLogger::info($this->tid(), 'basalam', 'commission', 'Commission rates imported', ['matched' => $matched, 'unmatched' => $unmatched]);

        return ['ok' => true, 'message' => 'imported', 'matched' => $matched, 'unmatched' => $unmatched, 'row_count' => $matched];
    }

    protected static function fail(string $message): array
    {
        return ['ok' => false, 'message' => $message, 'matched' => 0, 'unmatched' => 0, 'row_count' => 0];
    }

    /** @return list<array{l1: string, l2: string, l3: string, percent: float}> */
    public static function parseCsvRows(string $csv): array
    {
        $lines = preg_split('/\R/u', $csv) ?: [];
        $out = [];
        $header = true;
        $map = ['l1' => 0, 'l2' => 1, 'l3' => 2, 'pct' => 3];
        foreach ($lines as $line) {
            $line = trim((string) $line);
            if ($line === '') {
                continue;
            }
            $cells = str_getcsv($line);
            if (count($cells) < 2) {
                continue;
            }
            if ($header) {
                $header = false;
                $detected = self::detectColumns($cells);
                if ($detected === null) {
                    $parsed = self::rowFromCells($cells, $map);
                    if ($parsed !== null) {
                        $out[] = $parsed;
                    }
                } else {
                    $map = $detected;
                }

                continue;
            }
            $parsed = self::rowFromCells($cells, $map);
            if ($parsed !== null) {
                $out[] = $parsed;
            }
        }

        return $out;
    }

    /** @param  list<string|null>  $cells */
    protected static function detectColumns(array $cells): ?array
    {
        $map = ['l1' => -1, 'l2' => -1, 'l3' => -1, 'pct' => -1];
        foreach ($cells as $i => $cell) {
            $n = self::normalizeName((string) $cell);
            $level = str_contains($n, 'سطح');
            if (str_contains($n, 'سطح1') || ($level && str_contains($n, '1')) || str_contains($n, 'level1')) {
                $map['l1'] = (int) $i;
            } elseif (str_contains($n, 'سطح2') || ($level && str_contains($n, '2')) || str_contains($n, 'level2')) {
                $map['l2'] = (int) $i;
            } elseif (str_contains($n, 'سطح3') || ($level && str_contains($n, '3')) || str_contains($n, 'level3')) {
                $map['l3'] = (int) $i;
            } elseif (str_contains($n, 'کارمزد') || str_contains($n, 'commission') || str_contains($n, 'خرده')) {
                $map['pct'] = (int) $i;
            }
        }
        if ($map['l1'] < 0 && $map['pct'] < 0) {
            return null;
        }
        foreach (['l1' => 0, 'l2' => 1, 'l3' => 2, 'pct' => 3] as $k => $default) {
            if ($map[$k] < 0) {
                $map[$k] = $default;
            }
        }

        return $map;
    }

    /** @param  list<string|null>  $cells */
    protected static function rowFromCells(array $cells, array $map): ?array
    {
        $l1 = trim((string) ($cells[$map['l1']] ?? ''));
        $l2 = trim((string) ($cells[$map['l2']] ?? ''));
        $l3 = trim((string) ($cells[$map['l3']] ?? ''));
        $raw = str_replace(',', '.', trim(str_replace(['%', '٪', ' '], '', (string) ($cells[$map['pct']] ?? ''))));
        $pct = is_numeric($raw) ? (float) $raw : 0.0;
        if (($l1 === '' && $l3 === '') || $pct <= 0) {
            return null;
        }

        return ['l1' => $l1, 'l2' => $l2, 'l3' => $l3, 'percent' => $pct];
    }

    /** @param  list<array<string, mixed>>  $tree */
    public static function buildNameIndex(array $tree): array
    {
        $byNorm = [];
        $flat = [];
        $walk = function (array $nodes, array $pathIds) use (&$walk, &$byNorm, &$flat) {
            foreach ($nodes as $node) {
                if (! is_array($node) || empty($node['id'])) {
                    continue;
                }
                $id = (int) $node['id'];
                $name = (string) ($node['name'] ?? '');
                $norm = self::normalizeName($name);
                $ids = array_merge($pathIds, [$id]);
                if ($norm !== '') {
                    $byNorm[$norm][] = ['id' => $id, 'path' => $ids];
                }
                $flat[(string) $id] = ['id' => $id, 'path' => $ids, 'name' => $name];
                if (! empty($node['children']) && is_array($node['children'])) {
                    $walk($node['children'], $ids);
                }
            }
        };
        $walk($tree, []);

        return ['by_norm' => $byNorm, 'flat' => $flat];
    }

    /** Leaf match scored 4/2/1 for level3/2/1 names present on the candidate path. */
    public static function resolvePath(array $index, string $l1, string $l2, string $l3): ?array
    {
        $n1 = self::normalizeName($l1);
        $n2 = self::normalizeName($l2);
        $n3 = self::normalizeName($l3);
        $candidates = $index['by_norm'][$n3] ?? [];
        if ($candidates === [] && $n2 !== '') {
            $candidates = $index['by_norm'][$n2] ?? [];
        }
        if ($candidates === [] && $n1 !== '') {
            $candidates = $index['by_norm'][$n1] ?? [];
        }
        $best = null;
        foreach ($candidates as $c) {
            $names = array_map(fn ($id) => self::normalizeName((string) ($index['flat'][(string) $id]['name'] ?? '')), $c['path']);
            $score = ($n3 !== '' && in_array($n3, $names, true) ? 4 : 0)
                + ($n2 !== '' && in_array($n2, $names, true) ? 2 : 0)
                + ($n1 !== '' && in_array($n1, $names, true) ? 1 : 0);
            if ($best === null || $score > $best['score']) {
                $best = ['score' => $score, 'leaf_id' => (int) $c['id'], 'ids' => $c['path']];
            }
        }
        if ($best === null || $best['score'] < 1) {
            return null;
        }

        return ['leaf_id' => $best['leaf_id'], 'ids' => $best['ids']];
    }

    public static function normalizeName(string $name): string
    {
        $name = str_replace(['ي', 'ك', 'ة', 'ؤ', 'إ', 'أ', 'آ'], ['ی', 'ک', 'ه', 'و', 'ا', 'ا', 'ا'], trim($name));
        $name = strtr($name, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
        $name = preg_replace('/\s+/u', '', $name) ?? $name;

        return mb_strtolower($name);
    }

    /** Summary for the REST commission endpoint. */
    public function summary(): array
    {
        $data = $this->get();
        $engine = (new BasalamSettings($this->settings()))->engine($this->tid());

        return [
            'row_count' => $data['row_count'],
            'unmatched' => $data['unmatched'],
            'imported_at' => $data['imported_at'],
            'price_change_value' => $engine['price_change_value'],
            'commission_enabled' => BasalamSettings::isCommission($engine['price_change_value']),
        ];
    }
}
