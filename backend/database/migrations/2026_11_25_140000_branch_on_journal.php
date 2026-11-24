<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A branch on every journal entry.
 *
 * Three branches in one panel meant one ledger: the P&L of the shop on Valiasr and the one in
 * Tajrish were the same number, and the only branch filter that existed was on the order tables.
 * That is enough to run one café and useless for running three.
 *
 * The column goes on the entry rather than on each line because a journal belongs to exactly one
 * place: a sale at branch 2 does not have half its VAT at branch 1. Lines inherit it.
 *
 * Nullable and never guessed. An entry posted by a document with no branch (a head-office
 * expense, a manual journal) has none, and the reports say "unassigned" rather than quietly
 * filing it under the first branch — a report that miscounts by omission is worse than one that
 * admits a gap.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('acc_journal_entries') || Schema::hasColumn('acc_journal_entries', 'branch_id')) {
            return;
        }

        Schema::table('acc_journal_entries', function (Blueprint $table): void {
            $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id')->index('journal_entry_branch_index');
        });

        // The documents that name a place, so their journals can carry it.
        foreach (['expenses', 'supplier_invoices', 'acc_fixed_assets'] as $table) {
            if (Schema::hasTable($table) && ! Schema::hasColumn($table, 'branch_id')) {
                Schema::table($table, function (Blueprint $blueprint): void {
                    $blueprint->unsignedBigInteger('branch_id')->nullable();
                });
            }
        }

        // The cafe's own sale journals (the `accounting_journals` table the reports read) had the
        // same gap: an order knew its branch and its journal did not.
        if (Schema::hasTable('accounting_journals') && ! Schema::hasColumn('accounting_journals', 'branch_id')) {
            Schema::table('accounting_journals', function (Blueprint $table): void {
                $table->unsignedBigInteger('branch_id')->nullable()->index('accounting_journal_branch_index');
            });
        }

        // A warehouse sits in exactly one branch, and that is what lets a stock movement's
        // journal land in the right ledger without asking a person.
        if (Schema::hasTable('acc_warehouses') && ! Schema::hasColumn('acc_warehouses', 'branch_id')) {
            Schema::table('acc_warehouses', function (Blueprint $table): void {
                $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('acc_journal_entries') || ! Schema::hasColumn('acc_journal_entries', 'branch_id')) {
            return;
        }

        Schema::table('acc_journal_entries', function (Blueprint $table): void {
            $table->dropIndex('journal_entry_branch_index');
            $table->dropColumn('branch_id');
        });

        foreach (['expenses', 'supplier_invoices', 'acc_fixed_assets'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'branch_id')) {
                Schema::table($table, function (Blueprint $blueprint): void {
                    $blueprint->dropColumn('branch_id');
                });
            }
        }

        if (Schema::hasTable('accounting_journals') && Schema::hasColumn('accounting_journals', 'branch_id')) {
            Schema::table('accounting_journals', function (Blueprint $table): void {
                $table->dropIndex('accounting_journal_branch_index');
                $table->dropColumn('branch_id');
            });
        }

        if (Schema::hasTable('acc_warehouses') && Schema::hasColumn('acc_warehouses', 'branch_id')) {
            Schema::table('acc_warehouses', function (Blueprint $table): void {
                $table->dropColumn('branch_id');
            });
        }
    }
};
