<?php

namespace App\Services\Stock;

use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The opening stock, from the sheet the shop already keeps.
 *
 * A café that has traded for a year does not open our system with empty shelves: it has rice,
 * milk, beans and forty other things on hand, at a cost nobody remembers line by line. Typing
 * each one through the receive form is the step where a migration stops, and typing fifty of
 * them with a guessed price each is where the weighted average is wrong for the next year.
 *
 * So the same two-step shape as the menu import:
 *
 *  1. **preview()** parses, matches product names, and reports every row it cannot accept with
 *     the line number and the reason. Nothing is written.
 *  2. **commit()** receives the parseable rows through {@see StockLedger}, so each one posts its
 *     inventory journal and enters the batch/cost engine exactly as a purchase would.
 *
 * Deliberate limits, each for a reason:
 *
 *  - A row with no cost is an error, not zero. Zero-cost stock makes every plate's food cost
 *    zero forever, and the first person to notice is the accountant a quarter later.
 *  - A row whose product name matches nothing is an error, not a new product. The ingredient
 *    catalogue is the shop's, and silently creating `شیر` because it typed `شير` would split
 *    one ingredient's stock in two.
 *  - Quantity may be written in the purchase unit (`خرید`) as well as the base unit, because
 *    what is on the shelf is "half a carton", not "6 kilograms".
 */
final class StockOpening
{
    public function __construct(private readonly StockLedger $stock) {}

    /**
     * Parse and validate without writing anything.
     *
     * @param  array<string, string>  $map  our field => the file's heading
     * @return array<string, mixed>
     */
    public function preview(int $tenantId, string $body, array $map = []): array
    {
        $rows = $this->parse($body);

        if ($rows === []) {
            throw ValidationException::withMessages(['file' => __('api.stock_opening_empty_file')]);
        }

        if ($map === []) {
            $map = $this->guessMap($rows[0]);
        }

        if (! isset($map['name']) || ! isset($map['quantity']) || ! isset($map['unit_cost_minor'])) {
            throw ValidationException::withMessages(['map' => __('api.stock_opening_needs_columns')]);
        }

        $prepared = [];
        $errors = [];

        foreach ($rows as $index => $row) {
            $line = $index + 2;

            $result = $this->prepareRow($tenantId, $row, $map);

            if (isset($result['error'])) {
                $errors[] = ['line' => $line, 'message' => $result['error']];
                continue;
            }

            $prepared[] = $result['row'] + ['line' => $line];
        }

        return [
            'rows' => $prepared,
            'errors' => $errors,
            'total' => count($rows),
            'ready' => count($prepared),
            'map' => $map,
        ];
    }

    /**
     * Receive the parseable rows.
     *
     * Each row is independent: one bad line is reported and the rest still land, because a
     * 200-line sheet should not be re-typed over a typo on line 87.
     *
     * @param  array<string, string>  $map
     * @return array{received: int, failed: list<array{line: int, message: string}>, value_minor: float}
     */
    public function commit(int $tenantId, string $body, array $map, ?int $userId = null, ?string $documentDate = null): array
    {
        $preview = $this->preview($tenantId, $body, $map);

        $received = 0;
        $failed = $preview['errors'];
        $value = 0.0;

        foreach ($preview['rows'] as $row) {
            try {
                $result = $this->stock->receive(
                    $tenantId,
                    (int) $row['product_id'],
                    (float) $row['quantity'],
                    (float) $row['unit_cost_minor'],
                    [
                        'warehouse_id' => $row['warehouse_id'],
                        'note' => __('api.stock_opening_note'),
                        'reference_type' => 'opening_balance',
                        'document_date' => $documentDate,
                    ],
                );

                $value += (float) ($result['value_minor'] ?? 0);
                $received++;
            } catch (\Throwable $e) {
                $failed[] = ['line' => (int) $row['line'], 'message' => $e->getMessage()];
            }
        }

        return ['received' => $received, 'failed' => $failed, 'value_minor' => round($value, 2)];
    }

    /** Our field => the heading spellings we recognise, Persian first. */
    private const HEADINGS = [
        'name' => ['name', 'product', 'item', 'نام', 'نام کالا', 'کالا', 'آیتم', 'ماده اولیه'],
        'quantity' => ['quantity', 'qty', 'count', 'موجودی', 'مقدار', 'تعداد', 'موجودی اولیه'],
        'unit_cost_minor' => ['cost', 'unit_cost', 'price', 'بهای واحد', 'قیمت خرید', 'قیمت واحد', 'بهای تمام‌شده'],
        'unit' => ['unit', 'uom', 'واحد'],
        'warehouse' => ['warehouse', 'store', 'انبار'],
        'batch_no' => ['batch', 'lot', 'شماره بچ', 'بچ'],
        'expires_on' => ['expiry', 'expires_on', 'expire', 'تاریخ انقضا', 'انقضا'],
    ];

    /**
     * One row, validated and converted. Returns `row` or `error`, never both.
     *
     * @param  array<string, string>  $row
     * @param  array<string, string>  $map
     * @return array{row?: array<string, mixed>, error?: string}
     */
    private function prepareRow(int $tenantId, array $row, array $map): array
    {
        $name = trim((string) ($row[$map['name']] ?? ''));

        if ($name === '') {
            return ['error' => __('api.stock_opening_missing_name')];
        }

        $product = Product::query()
            ->where('tenant_id', $tenantId)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
            ->first(['id', 'name']);

        if ($product === null) {
            return ['error' => __('api.stock_opening_unknown_product', ['name' => $name])];
        }

        $rawQty = trim((string) ($row[$map['quantity']] ?? ''));
        $quantity = $this->number($rawQty);

        if ($quantity === null || $quantity <= 0) {
            return ['error' => __('api.stock_opening_bad_quantity', ['value' => $rawQty])];
        }

        $rawCost = trim((string) ($row[$map['unit_cost_minor']] ?? ''));
        $cost = $this->number($rawCost);

        // A missing cost is refused rather than assumed: zero-cost stock zeroes every plate
        // cost that uses it, silently, for as long as it is on hand.
        if ($cost === null || $cost < 0) {
            return ['error' => __('api.stock_opening_bad_cost', ['value' => $rawCost])];
        }

        $warehouseId = $this->warehouseId($tenantId, isset($map['warehouse']) ? (string) ($row[$map['warehouse']] ?? '') : '');

        if ($warehouseId === false) {
            $requested = trim((string) ($row[$map['warehouse']] ?? ''));

            return ['error' => __('api.stock_opening_unknown_warehouse', ['name' => $requested])];
        }

        $out = [
            'product_id' => (int) $product->id,
            'product_name' => (string) $product->name,
            'quantity' => round($quantity, 4),
            'unit_cost_minor' => round($cost, 2),
            'warehouse_id' => $warehouseId,
        ];

        if (isset($map['batch_no'])) {
            $batch = trim((string) ($row[$map['batch_no']] ?? ''));
            $out['batch_no'] = $batch === '' ? null : $batch;
        }

        if (isset($map['expires_on'])) {
            $raw = trim((string) ($row[$map['expires_on']] ?? ''));
            $out['expires_on'] = $raw === '' ? null : $this->date($raw);
        }

        return ['row' => $out];
    }

    /**
     * The warehouse named in the row, the tenant's default, or `false` for an unknown name.
     *
     * @return int|false|null
     */
    private function warehouseId(int $tenantId, string $name): int|false|null
    {
        $query = DB::table('acc_warehouses')->where('tenant_id', $tenantId);

        if (trim($name) === '') {
            $default = (clone $query)->orderBy('id')->value('id');

            return $default === null ? null : (int) $default;
        }

        $found = (clone $query)->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($name))])->value('id');

        return $found === null ? false : (int) $found;
    }

    /**
     * A number as a person writes it: Persian digits, thousands separators, a Persian decimal.
     *
     * `۱۲٫۵` is what a Persian Excel exports, and refusing it would make the import unusable
     * for the shops it is written for.
     */
    public function number(string $raw): ?float
    {
        $value = strtr($raw, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '٬' => '', ',' => '', '،' => '', ' ' => '', "\u{200c}" => '', '٫' => '.',
        ]);

        if (! preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            return null;
        }

        return (float) $value;
    }

    /** `1403/08/03`, `2026-11-24` or a Gregorian ISO date, all of which appear in real sheets. */
    private function date(string $raw): ?string
    {
        $value = strtr($raw, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);

        if (preg_match('/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/', $value, $m) !== 1) {
            return null;
        }

        [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];

        // A Jalali year is far below the Gregorian one, and guessing wrong would put an expiry
        // date fifty years in the past — so a Jalali date is converted, not stored as written.
        if ($y < 1700) {
            return $this->jalaliToGregorian($y, $mo, $d);
        }

        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }

    /**
     * Jalali → Gregorian, arithmetic form.
     *
     * Good for expiry dates: it is exact for the range a shelf life lives in (± a day at the
     * extremes), and it needs no extension this deployment may not have.
     */
    private function jalaliToGregorian(int $jy, int $jm, int $jd): string
    {
        $jy += 1595;
        $days = -355668 + (365 * $jy) + (((int) ($jy / 33)) * 8) + ((int) ((($jy % 33) + 3) / 4)) + $jd
            + (($jm < 7) ? (($jm - 1) * 31) : ((($jm - 7) * 30) + 186));

        $gy = 400 * ((int) ($days / 146097));
        $days %= 146097;

        if ($days > 36524) {
            $gy += 100 * ((int) (--$days / 36524));
            $days %= 36524;
            if ($days >= 365) {
                $days++;
            }
        }

        $gy += 4 * ((int) ($days / 1461));
        $days %= 1461;

        if ($days > 365) {
            $gy += (int) (($days - 1) / 365);
            $days = ($days - 1) % 365;
        }

        $gd = $days + 1;

        $leap = ($gy % 4 === 0 && $gy % 100 !== 0) || ($gy % 400 === 0);
        $monthDays = [31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        $gm = 1;
        foreach ($monthDays as $length) {
            if ($gd <= $length) {
                break;
            }
            $gd -= $length;
            $gm++;
        }

        return sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
    }

    /**
     * Split a CSV/TSV body into rows keyed by heading.
     *
     * @return list<array<string, string>>
     */
    public function parse(string $body): array
    {
        $body = preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body;
        $body = str_replace(["\r\n", "\r"], "\n", $body);

        $lines = array_values(array_filter(explode("\n", $body), fn (string $l) => trim($l) !== ''));

        if (count($lines) < 2) {
            return [];
        }

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
}
