<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a receipt/payment voucher to the journal entry that moved the money.
 *
 * `postReceipt` used to flip `status = posted` and cut no journal, so the voucher list and
 * the ledger could disagree forever with nothing pointing at the gap. Keeping the entry id on
 * the voucher makes "which journal did this receipt create" a fact on the row instead of
 * something an accountant has to hunt for by date and amount.
 *
 * `acc_cash_accounts.chart_code` is the second half: a shop with a drawer and three bank
 * accounts needs to say which ledger account each one is. Without it every receipt posted to
 * one hard-coded cash code, which is why bank deposits showed up in the till.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('acc_receipt_vouchers') && ! Schema::hasColumn('acc_receipt_vouchers', 'journal_entry_id')) {
            Schema::table('acc_receipt_vouchers', function (Blueprint $table): void {
                $table->foreignId('journal_entry_id')->nullable()->after('status')
                    ->constrained('acc_journal_entries')->nullOnDelete();
            });
        }

        if (Schema::hasTable('acc_cash_accounts') && ! Schema::hasColumn('acc_cash_accounts', 'chart_code')) {
            Schema::table('acc_cash_accounts', function (Blueprint $table): void {
                // Which chart account this drawer/bank/terminal posts to. Null falls back to
                // the tenant's `cash`/`bank` role coding.
                $table->string('chart_code', 32)->nullable()->after('card_number');
            });
        }

        // Deliberately no backfill. The drawer's chart code is per tenant — the shipped
        // default is `1102` (see AccountCoding::defaults) but a shop on its own chart may
        // number it 111. Guessing here would post real money to an account nobody chose, and
        // the posting path already falls back to the tenant's `cash` role coding when the
        // column is null.
    }

    public function down(): void
    {
        if (Schema::hasTable('acc_receipt_vouchers') && Schema::hasColumn('acc_receipt_vouchers', 'journal_entry_id')) {
            Schema::table('acc_receipt_vouchers', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('journal_entry_id');
            });
        }

        if (Schema::hasTable('acc_cash_accounts') && Schema::hasColumn('acc_cash_accounts', 'chart_code')) {
            Schema::table('acc_cash_accounts', function (Blueprint $table): void {
                $table->dropColumn('chart_code');
            });
        }
    }
};
