<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Facades\DB;

/**
 * The KDS board's columns: which prep states show as columns, in what order, under what name.
 *
 * A bakery wants «در فر» and «آماده تحویل»; a coffee bar wants «صفحه» and «بیرون». The keys are
 * the four prep states the kitchen API understands; the labels and order are the tenant's.
 *
 * Columns are scoped per station: a pinch of salt on the hot line and a pastry on the bake
 * line need not share a column set. A station with no rows falls back to the tenant-wide set
 * (station_id null), which the migration seeds, so the board is never empty.
 */
final class KitchenColumns
{
    /** The prep states the kitchen API accepts, in their natural order. */
    public const KEYS = ['new', 'preparing', 'ready', 'served'];

    /**
     * Effective columns for a station, or the tenant default when the station has none.
     *
     * @return list<array{key: string, label_fa: string, label_en: string|null, sort_order: int}>
     */
    public function forStation(int $tenantId, ?int $stationId): array
    {
        $query = DB::table('cafe_kitchen_station_columns')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true);

        if ($stationId !== null) {
            $scoped = (clone $query)->where('station_id', $stationId)->orderBy('sort_order')->get();
            if ($scoped->isNotEmpty()) {
                return $this->shape($scoped);
            }
        }

        return $this->shape(
            $query->whereNull('station_id')->orderBy('sort_order')->get()
        );
    }

    /**
     * Every row for the settings screen: the tenant defaults plus each station's overrides.
     *
     * @return array{default: list<array<string, mixed>>, stations: array<int, list<array<string, mixed>>>}
     */
    public function all(int $tenantId): array
    {
        $rows = DB::table('cafe_kitchen_station_columns')
            ->where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->get();

        $default = $rows->whereNull('station_id')->values();
        $byStation = $rows->whereNotNull('station_id')->groupBy('station_id');

        $stations = [];
        foreach ($byStation as $stationId => $group) {
            $stations[(int) $stationId] = $this->shape($group->values());
        }

        return ['default' => $this->shape($default), 'stations' => $stations];
    }

    /**
     * Replace a scope's columns wholesale.
     *
     * Wholesale rather than per-row so a rename, a reorder and a removal are one request and
     * cannot leave the board showing two columns with the same key.
     *
     * @param  list<array{key: string, label_fa: string, label_en?: string|null, sort_order?: int, is_active?: bool}>  $columns
     */
    public function replace(int $tenantId, ?int $stationId, array $columns): array
    {
        DB::transaction(function () use ($tenantId, $stationId, $columns): void {
            $q = DB::table('cafe_kitchen_station_columns')->where('tenant_id', $tenantId);
            $stationId === null ? $q->whereNull('station_id') : $q->where('station_id', $stationId);
            $q->delete();

            foreach (array_values($columns) as $i => $col) {
                DB::table('cafe_kitchen_station_columns')->insert([
                    'tenant_id' => $tenantId,
                    'station_id' => $stationId,
                    'key' => (string) $col['key'],
                    'label_fa' => (string) $col['label_fa'],
                    'label_en' => $col['label_en'] ?? null,
                    'sort_order' => (int) ($col['sort_order'] ?? $i),
                    'is_active' => (bool) ($col['is_active'] ?? true),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });

        return $this->all($tenantId);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>|\Illuminate\Support\Collection  $rows
     * @return list<array<string, mixed>>
     */
    private function shape($rows): array
    {
        return $rows->map(fn ($r): array => [
            'id' => (int) $r->id,
            'key' => (string) $r->key,
            'label_fa' => (string) $r->label_fa,
            'label_en' => $r->label_en !== null ? (string) $r->label_en : null,
            'sort_order' => (int) $r->sort_order,
            'is_active' => (bool) $r->is_active,
        ])->values()->all();
    }
}
