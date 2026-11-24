<?php

namespace Modules\Cafe\Services;

use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Adding twenty dishes at once, from a spreadsheet the shop already has.
 *
 * Cafés do not start with an empty menu; they start with a price list in Excel. Retyping it
 * one dish at a time is where a migration project dies, and a blind bulk insert is where it
 * fails loudly halfway through. So this is deliberately two steps:
 *
 *  1. **preview()** parses the file, maps the shop's columns onto ours, and reports every row
 *     it cannot accept — with the row number and the reason. Nothing is written.
 *  2. **commit()** inserts the rows that parsed, and reports each failure individually instead
 *     of abandoning the batch on the first bad row.
 *
 * Two decisions worth stating:
 *
 *  - **A price is never guessed.** A row without a price is an error, not a zero. Zero-priced
 *    dishes reach the till and sell for nothing.
 *  - **A duplicate is an update, not an insert.** A café that re-imports a corrected sheet
 *    means "fix these", not "create a second Latte". The match key is SKU when present,
 *    otherwise the name.
 */
final class MenuImport
{
    /** Our field → the heading spellings we recognise (Persian and English). */
    private const HEADINGS = [
        'name' => ['name', 'title', 'نام', 'نام محصول', 'نام آیتم', 'عنوان'],
        'price_minor' => ['price', 'price_minor', 'قیمت', 'قیمت (تومان)', 'مبلغ'],
        'sku' => ['sku', 'code', 'کد', 'کد کالا', 'بارکد'],
        'description' => ['description', 'توضیحات', 'شرح'],
        'category' => ['category', 'دسته', 'دسته‌بندی', 'گروه'],
        'is_available' => ['available', 'is_available', 'موجود', 'فعال'],
        'cost_minor' => ['cost', 'purchase_price', 'بهای تمام‌شده', 'قیمت خرید'],
    ];

    /**
     * Parse a CSV/TSV body against an explicit column map, without writing anything.
     *
     * @param  array<string, string>  $map  our field => the file's heading, as chosen by the user
     * @return array<string, mixed>
     */
    public function preview(string $body, array $map, int $tenantId): array
    {
        $rows = $this->parse($body);

        if ($rows === []) {
            throw ValidationException::withMessages(['file' => __('api.cafe_import_empty_file')]);
        }

        // No map supplied: guess from the headings, which is what most sheets need.
        if ($map === []) {
            $map = $this->guessMap($rows[0]);
        }

        if (! isset($map['name']) || ! isset($map['price_minor'])) {
            throw ValidationException::withMessages(['map' => __('api.cafe_import_needs_name_price')]);
        }

        $prepared = [];
        $errors = [];

        foreach ($rows as $index => $row) {
            // +2: one for the header row, one because a person counts rows from 1.
            $line = $index + 2;
            $result = $this->prepareRow($row, $map, $tenantId, $line);

            if (isset($result['error'])) {
                $errors[] = ['line' => $line, 'message' => $result['error']];
                continue;
            }

            $prepared[] = $result['row'];
        }

        return [
            'columns' => array_keys($rows[0]),
            'map' => $map,
            'total' => count($rows),
            'valid' => count($prepared),
            'invalid' => count($errors),
            'errors' => array_slice($errors, 0, 50),
            // The first few parsed rows, so a person can see the mapping worked before saving.
            'sample' => array_slice($prepared, 0, 10),
        ];
    }

    /**
     * Insert (or update) the parsed rows.
     *
     * @param  array<string, string>  $map
     * @return array{created: int, updated: int, failed: list<array{line: int, message: string}>}
     */
    public function commit(string $body, array $map, int $tenantId): array
    {
        $rows = $this->parse($body);
        $map = $map === [] ? $this->guessMap($rows[0] ?? []) : $map;

        if (! isset($map['name']) || ! isset($map['price_minor'])) {
            throw ValidationException::withMessages(['map' => __('api.cafe_import_needs_name_price')]);
        }

        $created = 0;
        $updated = 0;
        $failed = [];

        DB::transaction(function () use ($rows, $map, $tenantId, &$created, &$updated, &$failed): void {
            foreach ($rows as $index => $row) {
                $line = $index + 2;
                $result = $this->prepareRow($row, $map, $tenantId, $line);

                if (isset($result['error'])) {
                    $failed[] = ['line' => $line, 'message' => $result['error']];
                    continue;
                }

                $data = $result['row'];

                // SKU first: it survives a rename. Name second, because a café that has no
                // SKUs still means "the Latte", not "a second Latte".
                $existing = Product::query()
                    ->where('tenant_id', $tenantId)
                    ->when(
                        ($data['sku'] ?? null) !== null,
                        fn ($q) => $q->where('sku', $data['sku']),
                        fn ($q) => $q->where('name', $data['name']),
                    )
                    ->first();

                if ($existing !== null) {
                    // A re-import fixes price and availability; it does not overwrite the
                    // description or images somebody has since curated on the product page.
                    $existing->fill(array_intersect_key($data, array_flip([
                        'price_minor', 'is_available', 'sku', 'category_id',
                    ])))->save();
                    $updated++;
                    continue;
                }

                Product::query()->create($data + [
                    'slug' => $this->uniqueSlug($tenantId, (string) $data['name']),
                    'currency' => 'IRT',
                    'status' => 'publish',
                    'type' => 'simple',
                ]);
                $created++;
            }
        });

        return ['created' => $created, 'updated' => $updated, 'failed' => $failed];
    }

    /**
     * Split a CSV/TSV body into rows keyed by heading.
     *
     * @return list<array<string, string>>
     */
    public function parse(string $body): array
    {
        // Excel writes UTF-8 with a BOM; left in place it becomes part of the first heading and
        // the name column silently fails to match.
        $body = preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body;
        $body = str_replace(["\r\n", "\r"], "\n", $body);

        $lines = array_values(array_filter(explode("\n", $body), fn (string $l) => trim($l) !== ''));

        if (count($lines) < 2) {
            return [];
        }

        // A semicolon is what Excel exports in a Persian locale.
        $delimiter = $this->delimiter($lines[0]);

        $headings = array_map(fn ($h) => trim((string) $h), str_getcsv($lines[0], $delimiter, '"', '\\'));

        $rows = [];
        foreach (array_slice($lines, 1) as $line) {
            $cells = str_getcsv($line, $delimiter, '"', '\\');

            $row = [];
            foreach ($headings as $index => $heading) {
                if ($heading === '') {
                    continue;
                }
                $row[$heading] = trim((string) ($cells[$index] ?? ''));
            }

            if ($row !== []) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /** @param  array<string, string>  $header */
    public function guessMap(array $header): array
    {
        $map = [];

        foreach (self::HEADINGS as $field => $aliases) {
            foreach ($header as $heading) {
                if (in_array(mb_strtolower(trim($heading)), $aliases, true)) {
                    $map[$field] = $heading;
                    break;
                }
            }
        }

        return $map;
    }

    /**
     * One row, validated and converted. Returns either `row` or `error`, never both.
     *
     * @param  array<string, string>  $row
     * @param  array<string, string>  $map
     * @return array{row?: array<string, mixed>, error?: string}
     */
    private function prepareRow(array $row, array $map, int $tenantId, int $line): array
    {
        $name = trim((string) ($row[$map['name']] ?? ''));
        if ($name === '') {
            return ['error' => __('api.cafe_import_missing_name')];
        }

        $rawPrice = trim((string) ($row[$map['price_minor']] ?? ''));
        if ($rawPrice === '') {
            return ['error' => __('api.cafe_import_missing_price')];
        }

        $price = $this->money($rawPrice);
        if ($price === null) {
            return ['error' => __('api.cafe_import_bad_price', ['value' => $rawPrice])];
        }

        $sku = isset($map['sku']) ? trim((string) ($row[$map['sku']] ?? '')) : '';

        // A category is matched by name; an unknown one is left unset rather than invented.
        $categoryId = null;
        $categoryName = isset($map['category']) ? trim((string) ($row[$map['category']] ?? '')) : '';
        if ($categoryName !== '') {
            $categoryId = DB::table('categories')
                ->where('tenant_id', $tenantId)
                ->where('name', $categoryName)
                ->value('id');
            $categoryId = $categoryId === null ? null : (int) $categoryId;
        }

        $available = true;
        if (isset($map['is_available'])) {
            $flag = mb_strtolower(trim((string) ($row[$map['is_available']] ?? '')));
            $available = ! in_array($flag, ['0', 'no', 'false', 'خیر', 'غیرفعال', 'ناموجود'], true);
        }

        $out = [
            'name' => $name,
            'price_minor' => $price,
            'sku' => $sku === '' ? null : $sku,
            'is_available' => $available,
            'category_id' => $categoryId,
        ];

        if (isset($map['description'])) {
            $description = trim((string) ($row[$map['description']] ?? ''));
            if ($description !== '') {
                $out['description'] = $description;
            }
        }

        if (isset($map['cost_minor'])) {
            $cost = $this->money((string) ($row[$map['cost_minor']] ?? ''));
            if ($cost !== null) {
                $out['purchase_price_minor'] = $cost;
            }
        }

        return ['row' => $out];
    }

    /**
     * A price as written by a person: "45,000", "۴۵٬۰۰۰", "45000 تومان", "45000.00".
     *
     * Persian digits and thousands separators are the normal case here, not an edge case, and
     * rejecting them would make the import useless to the shops it is for.
     */
    public function money(string $raw): ?int
    {
        $value = strtr($raw, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '٬' => '', ',' => '', '،' => '', ' ' => '', "\u{200c}" => '',
        ]);

        // Anything left that is not a number means the cell is not a price.
        if (! preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            return null;
        }

        $number = (int) round((float) $value);

        return $number < 0 ? null : $number;
    }

    private function delimiter(string $headerLine): string
    {
        $semicolons = substr_count($headerLine, ';');
        $commas = substr_count($headerLine, ',');
        $tabs = substr_count($headerLine, "\t");

        return match (true) {
            $tabs > $semicolons && $tabs > $commas => "\t",
            $semicolons > $commas => ';',
            default => ',',
        };
    }

    /** A slug that will not collide with an existing product's URL. */
    private function uniqueSlug(int $tenantId, string $name): string
    {
        $base = Str::slug($name) ?: 'item';
        $slug = $base;
        $suffix = 2;

        while (Product::query()->where('tenant_id', $tenantId)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }
}
