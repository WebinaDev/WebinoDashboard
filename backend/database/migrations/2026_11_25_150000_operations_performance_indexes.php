<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes the live boards actually need.
 *
 * The kitchen, floor and delivery boards are polled every 8–20 seconds by every screen in the
 * building, and each poll ran a filter that no index served: recent rows for one tenant in a
 * set of statuses, ordered by `updated_at`. On a busy day that is a filesort over the whole
 * order history, several times a minute, per screen — which is how a two-second board becomes a
 * five-second one by dinner service.
 *
 * Each index is added only when it is missing, so this is safe to re-run against a database
 * that was tuned by hand.
 */
return new class extends Migration
{
    /** @var array<string, array{columns: array<int, string>, name: string}> */
    private array $indexes = [
        'orders' => [
            ['columns' => ['tenant_id', 'status', 'updated_at'], 'name' => 'orders_tenant_status_updated_idx'],
            ['columns' => ['tenant_id', 'updated_at'], 'name' => 'orders_tenant_updated_idx'],
            ['columns' => ['tenant_id', 'table_number'], 'name' => 'orders_tenant_table_idx'],
            ['columns' => ['tenant_id', 'delivery_status'], 'name' => 'orders_tenant_delivery_status_idx'],
        ],
        'order_items' => [
            ['columns' => ['order_id'], 'name' => 'order_items_order_idx'],
        ],
        'cafe_station_products' => [
            ['columns' => ['product_id'], 'name' => 'cafe_station_products_product_idx'],
            ['columns' => ['category_id'], 'name' => 'cafe_station_products_category_idx'],
        ],
        'cafe_tables' => [
            ['columns' => ['tenant_id', 'code'], 'name' => 'cafe_tables_tenant_code_idx'],
        ],
        'acc_journal_entries' => [
            ['columns' => ['tenant_id', 'branch_id', 'document_date'], 'name' => 'acc_journal_tenant_branch_date_idx'],
        ],
        'acc_journal_lines' => [
            ['columns' => ['journal_entry_id'], 'name' => 'acc_journal_lines_entry_idx'],
            ['columns' => ['tenant_id', 'account_id'], 'name' => 'acc_journal_lines_tenant_account_idx'],
        ],
    ];

    public function up(): void
    {
        foreach ($this->indexes as $table => $wanted) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $existing = array_map(
                static fn ($index): string => (string) ($index['name'] ?? ''),
                Schema::getIndexes($table),
            );

            foreach ($wanted as $index) {
                if (in_array($index['name'], $existing, true)) {
                    continue;
                }

                // A column that does not exist on this install (an older schema, a dropped
                // feature) must skip its index rather than fail the whole migration.
                $missing = false;
                foreach ($index['columns'] as $column) {
                    if (! Schema::hasColumn($table, $column)) {
                        $missing = true;
                        break;
                    }
                }

                if ($missing) {
                    continue;
                }

                Schema::table($table, function (Blueprint $blueprint) use ($index): void {
                    $blueprint->index($index['columns'], $index['name']);
                });
            }
        }
    }

    public function down(): void
    {
        foreach ($this->indexes as $table => $wanted) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $existing = array_map(
                static fn ($index): string => (string) ($index['name'] ?? ''),
                Schema::getIndexes($table),
            );

            foreach ($wanted as $index) {
                if (! in_array($index['name'], $existing, true)) {
                    continue;
                }

                Schema::table($table, function (Blueprint $blueprint) use ($index): void {
                    $blueprint->dropIndex($index['name']);
                });
            }
        }
    }
};
