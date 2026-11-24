<?php

namespace App\Services\Accounting;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccJournalEntry;

/**
 * Buying capital equipment and writing it down over its life.
 *
 * Straight-line only, deliberately. It is what a small shop's accountant files, and offering a
 * declining-balance option that nobody operates correctly is a way to produce wrong numbers with
 * more keystrokes.
 *
 * Two rules that keep the figures honest:
 *
 *  - **A month's depreciation posts once.** Re-running the run for a month that has been posted
 *    is a no-op rather than a doubling; `depreciated_through` is the guard.
 *  - **Never below salvage.** The last month posts only what is left, so a machine with a
 *    residual value does not depreciate to zero and a rounding error cannot push accumulated
 *    depreciation past the depreciable base.
 */
final class FixedAssets
{
    public function __construct(private readonly LedgerPosting $ledger) {}

    /**
     * Record an asset and post its purchase.
     *
     * @param  array{name: string, category?: string|null, serial_no?: string|null, acquired_on?: string|null, cost_minor: float, salvage_minor?: float|null, useful_life_months?: int|null, paid_from_code?: string|null, on_credit?: bool|null}  $data
     * @return array{asset_id: int, journal_entry_id: int}
     */
    public function create(int $tenantId, array $data, ?int $userId = null): array
    {
        $cost = round((float) $data['cost_minor'], 2);

        if ($cost <= 0) {
            throw ValidationException::withMessages(['cost_minor' => __('api.asset_cost_positive')]);
        }

        $salvage = round((float) ($data['salvage_minor'] ?? 0), 2);

        if ($salvage >= $cost) {
            // A residual worth more than the asset is not a residual, it is a typo.
            throw ValidationException::withMessages(['salvage_minor' => __('api.asset_salvage_too_high')]);
        }

        $life = max(1, (int) ($data['useful_life_months'] ?? 60));
        $acquiredOn = $data['acquired_on'] ?? now()->toDateString();

        // Paid from the drawer, or bought on account and owed to the supplier.
        $creditCode = (string) ($data['paid_from_code'] ?? ((bool) ($data['on_credit'] ?? false) ? '2102' : '1102'));

        return DB::transaction(function () use ($tenantId, $data, $userId, $cost, $salvage, $life, $acquiredOn, $creditCode): array {
            $assetId = (int) DB::table('acc_fixed_assets')->insertGetId([
                'tenant_id' => $tenantId,
                'name' => $data['name'],
                'category' => $data['category'] ?? null,
                'serial_no' => $data['serial_no'] ?? null,
                'acquired_on' => $acquiredOn,
                'cost_minor' => $cost,
                'salvage_minor' => $salvage,
                'useful_life_months' => $life,
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $description = __('api.asset_purchase', ['name' => $data['name']]);

            $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
                [
                    ['code' => '1201', 'debit' => $cost, 'description' => $description],
                    ['code' => $creditCode, 'credit' => $cost, 'description' => $description],
                ],
                [
                    'tenant_id' => $tenantId,
                    'document_date' => $acquiredOn,
                    'description' => $description,
                    'status' => 'posted',
                    'created_by' => $userId,
                ],
            ));

            DB::table('acc_fixed_assets')->where('id', $assetId)->update(['journal_entry_id' => $entry->id]);

            return ['asset_id' => $assetId, 'journal_entry_id' => (int) $entry->id];
        });
    }

    /**
     * Post depreciation for a month.
     *
     * @return array{posted: int, skipped: int, total_minor: float, period: string}
     */
    public function depreciate(int $tenantId, ?string $period = null, ?int $userId = null): array
    {
        $period ??= now()->format('Y-m');
        $monthEnd = Carbon::parse($period.'-01')->endOfMonth();
        $monthStart = $monthEnd->copy()->startOfMonth();

        $assets = DB::table('acc_fixed_assets')
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereDate('acquired_on', '<=', $monthEnd->toDateString())
            ->get();

        $posted = 0;
        $skipped = 0;
        $total = 0.0;

        foreach ($assets as $asset) {
            // Already depreciated through this month: a second run must not double it.
            if ($asset->depreciated_through !== null && (string) $asset->depreciated_through >= $monthEnd->toDateString()) {
                $skipped++;
                continue;
            }

            $cost = (float) $asset->cost_minor;
            $salvage = (float) ($asset->salvage_minor ?? 0);
            $life = max(1, (int) $asset->useful_life_months);
            $accumulated = (float) $asset->accumulated_minor;

            $depreciable = round($cost - $salvage, 2);
            $remaining = round($depreciable - $accumulated, 2);

            if ($remaining <= 0.009) {
                DB::table('acc_fixed_assets')->where('id', $asset->id)->update([
                    'status' => 'fully_depreciated',
                    'updated_at' => now(),
                ]);
                $skipped++;
                continue;
            }

            $monthly = round($depreciable / $life, 2);
            $amount = min($monthly, $remaining);

            DB::transaction(function () use ($tenantId, $asset, $amount, $monthEnd, $monthStart, $userId, &$total, &$posted): void {
                $description = __('api.asset_depreciation', ['name' => $asset->name, 'period' => $monthEnd->format('Y-m')]);

                AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
                    [
                        ['code' => (string) $asset->expense_account_code, 'debit' => $amount, 'description' => $description],
                        // Accumulated depreciation is a contra-asset, not a reduction of cost: the
                        // balance sheet must show what it cost and how much has been written off.
                        ['code' => (string) $asset->accumulated_account_code, 'credit' => $amount, 'description' => $description],
                    ],
                    [
                        'tenant_id' => $tenantId,
                        'document_date' => $monthEnd->toDateString(),
                        'description' => $description,
                        'status' => 'posted',
                        'created_by' => $userId,
                    ],
                ));

                $accumulated = round((float) $asset->accumulated_minor + $amount, 2);
                $depreciable = round((float) $asset->cost_minor - (float) ($asset->salvage_minor ?? 0), 2);

                DB::table('acc_fixed_assets')->where('id', $asset->id)->update([
                    'accumulated_minor' => $accumulated,
                    'depreciated_through' => $monthEnd->toDateString(),
                    'status' => $accumulated >= $depreciable - 0.009 ? 'fully_depreciated' : 'active',
                    'updated_at' => now(),
                ]);

                $total += $amount;
                $posted++;
            });
        }

        return [
            'posted' => $posted,
            'skipped' => $skipped,
            'total_minor' => round($total, 2),
            'period' => $monthEnd->format('Y-m'),
        ];
    }

    /**
     * Sell or scrap an asset.
     *
     * The gain or loss is proceeds minus the written-down value, and it is stated rather than
     * folded into sales: an oven sold for more than its book value is not trading income.
     *
     * @return array{gain_minor: float, book_value_minor: float, journal_entry_id: int}
     */
    public function dispose(int $tenantId, int $assetId, float $proceeds, ?string $disposedOn = null, ?int $userId = null): array
    {
        $asset = DB::table('acc_fixed_assets')->where('tenant_id', $tenantId)->where('id', $assetId)->first();

        if ($asset === null) {
            throw ValidationException::withMessages(['asset' => __('api.asset_not_found')]);
        }

        if ((string) $asset->status === 'disposed') {
            throw ValidationException::withMessages(['asset' => __('api.asset_already_disposed')]);
        }

        $proceeds = round(max(0, $proceeds), 2);
        $accumulated = round((float) $asset->accumulated_minor, 2);
        $cost = round((float) $asset->cost_minor, 2);
        $bookValue = round($cost - $accumulated, 2);
        $gain = round($proceeds - $bookValue, 2);
        $date = $disposedOn ?? now()->toDateString();

        return DB::transaction(function () use ($tenantId, $assetId, $asset, $proceeds, $accumulated, $cost, $bookValue, $gain, $date, $userId): array {
            $lines = [
                // Take the cost and its accumulated depreciation off the books together.
                ['code' => (string) $asset->accumulated_account_code, 'debit' => $accumulated, 'description' => __('api.asset_disposal', ['name' => $asset->name])],
                ['code' => (string) $asset->asset_account_code, 'credit' => $cost, 'description' => __('api.asset_disposal', ['name' => $asset->name])],
            ];

            if ($proceeds > 0) {
                $lines[] = ['code' => '1102', 'debit' => $proceeds, 'description' => __('api.asset_disposal', ['name' => $asset->name])];
            }

            if ($gain > 0) {
                $lines[] = ['code' => '4201', 'credit' => $gain, 'description' => __('api.asset_gain', ['name' => $asset->name])];
            } elseif ($gain < 0) {
                $lines[] = ['code' => '6198', 'debit' => abs($gain), 'description' => __('api.asset_loss', ['name' => $asset->name])];
            }

            $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
                $lines,
                [
                    'tenant_id' => $tenantId,
                    'document_date' => $date,
                    'description' => __('api.asset_disposal', ['name' => $asset->name]),
                    'status' => 'posted',
                    'created_by' => $userId,
                ],
            ));

            DB::table('acc_fixed_assets')->where('id', $assetId)->update([
                'status' => 'disposed',
                'disposed_on' => $date,
                'disposal_proceeds_minor' => $proceeds,
                'journal_entry_id' => $entry->id,
                'updated_at' => now(),
            ]);

            return ['gain_minor' => $gain, 'book_value_minor' => $bookValue, 'journal_entry_id' => (int) $entry->id];
        });
    }

    /**
     * The register, with each asset's position worked out rather than stored twice.
     *
     * @return list<array<string, mixed>>
     */
    public function register(int $tenantId): array
    {
        return DB::table('acc_fixed_assets')
            ->where('tenant_id', $tenantId)
            ->orderBy('acquired_on')
            ->get()
            ->map(function ($asset): array {
                $cost = (float) $asset->cost_minor;
                $accumulated = (float) $asset->accumulated_minor;
                $depreciable = round($cost - (float) ($asset->salvage_minor ?? 0), 2);

                return [
                    'id' => (int) $asset->id,
                    'name' => $asset->name,
                    'category' => $asset->category,
                    'serial_no' => $asset->serial_no,
                    'acquired_on' => $asset->acquired_on,
                    'cost_minor' => $cost,
                    'salvage_minor' => (float) ($asset->salvage_minor ?? 0),
                    'useful_life_months' => (int) $asset->useful_life_months,
                    'monthly_minor' => round($depreciable / max(1, (int) $asset->useful_life_months), 2),
                    'accumulated_minor' => $accumulated,
                    'book_value_minor' => round($cost - $accumulated, 2),
                    'depreciated_through' => $asset->depreciated_through,
                    'status' => $asset->status,
                    'disposed_on' => $asset->disposed_on,
                    'disposal_proceeds_minor' => (float) ($asset->disposal_proceeds_minor ?? 0),
                ];
            })
            ->values()
            ->all();
    }
}
