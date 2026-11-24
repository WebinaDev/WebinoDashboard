<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cheques, tracked from the moment they are handed over to the moment they clear.
 *
 * `acc_checks` could already record a cheque and change its status, and the status change did
 * nothing to the books. So a customer's cheque sat in receivables until it was cashed, and a
 * bounced cheque stayed in the bank — the two moments when a cheque actually matters.
 *
 * The columns here are what a bounce needs to be actionable: who to chase, why it came back, and
 * when it was last moved.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('acc_checks')) {
            return;
        }

        Schema::table('acc_checks', function (Blueprint $table): void {
            if (! Schema::hasColumn('acc_checks', 'journal_entry_id')) {
                $table->foreignId('journal_entry_id')->nullable()->after('person_id')
                    ->constrained('acc_journal_entries')->nullOnDelete();
            }

            if (! Schema::hasColumn('acc_checks', 'bounced_reason')) {
                // A return without a reason is a number nobody can act on.
                $table->string('bounced_reason', 255)->nullable()->after('status');
            }

            if (! Schema::hasColumn('acc_checks', 'settled_on')) {
                $table->date('settled_on')->nullable()->after('bounced_reason');
            }

            if (! Schema::hasColumn('acc_checks', 'settled_amount')) {
                // Cheques are occasionally cashed for a different amount than written; the
                // difference is a real loss and must not be absorbed silently.
                $table->decimal('settled_amount', 18, 2)->nullable()->after('settled_on');
            }

            if (! Schema::hasColumn('acc_checks', 'cheque_book_id')) {
                $table->unsignedBigInteger('cheque_book_id')->nullable()->after('id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('acc_checks')) {
            return;
        }

        Schema::table('acc_checks', function (Blueprint $table): void {
            foreach (['journal_entry_id', 'bounced_reason', 'settled_on', 'settled_amount', 'cheque_book_id'] as $column) {
                if (Schema::hasColumn('acc_checks', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
