<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Credit limits, supplier invoices, and expenses that reach the ledger.
 *
 * Three gaps, one theme: money owed was invisible.
 *
 *  - **`acc_persons.credit_limit`** did not exist, so "on account" had no ceiling and the AR
 *    aging report could only report the damage after it happened.
 *  - **Supplier invoices did not exist as a document.** A purchase was a receipt of goods and
 *    a payment; the bill in between — what the supplier says you owe, with its due date — had
 *    nowhere to live, so payables were whatever the receipts implied.
 *  - **Expenses could only be entered as a raw journal.** Rent, electricity and repairs are the
 *    most common thing a small shop writes down, and each one required knowing which account to
 *    debit. That is why the ledger of a café is usually empty.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('acc_persons')) {
            Schema::table('acc_persons', function (Blueprint $table): void {
                if (! Schema::hasColumn('acc_persons', 'credit_limit')) {
                    // Zero means "no credit": cash only. A negative allowance is meaningless and
                    // a null would read as "unlimited", which is the opposite of safe.
                    $table->decimal('credit_limit', 18, 2)->default(0)->after('category');
                }
                if (! Schema::hasColumn('acc_persons', 'is_blocked')) {
                    // A blocked party can still be read and reconciled; it just cannot take on
                    // new debt. Deleting them would lose the history of what they owe.
                    $table->boolean('is_blocked')->default(false)->after('credit_limit');
                }
            });
        }

        if (! Schema::hasTable('supplier_invoices')) {
            Schema::create('supplier_invoices', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('supplier_id')->nullable()->constrained('acc_persons')->nullOnDelete();
                $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
                $table->string('number', 50)->nullable();
                // The supplier's own reference — the number printed on the bill.
                $table->string('supplier_reference', 100)->nullable();
                $table->date('issued_on')->nullable();
                $table->date('due_on')->nullable();
                // open | paid | cancelled
                $table->string('status', 24)->default('open');
                $table->decimal('total_minor', 18, 4)->default(0);
                $table->decimal('paid_minor', 18, 4)->default(0);
                $table->text('notes')->nullable();
                $table->foreignId('journal_entry_id')->nullable()->constrained('acc_journal_entries')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'status', 'due_on'], 'supplier_invoices_due_idx');
            });
        }

        if (! Schema::hasTable('expenses')) {
            Schema::create('expenses', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                // What was paid out of — the drawer, the bank, petty cash.
                $table->foreignId('cash_account_id')->nullable()->constrained('acc_cash_accounts')->nullOnDelete();
                // rent | utilities | repairs | supplies | transport | other
                $table->string('category', 40)->default('other');
                $table->string('title', 191);
                $table->decimal('amount_minor', 18, 4);
                $table->date('spent_on');
                // 1102 cash / 1103 bank, decided from the cash account when one is named.
                $table->string('payment_account_code', 32)->nullable();
                $table->string('expense_account_code', 32)->nullable();
                $table->string('reference', 100)->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('journal_entry_id')->nullable()->constrained('acc_journal_entries')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'spent_on'], 'expenses_date_idx');
                $table->index(['tenant_id', 'category'], 'expenses_category_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('supplier_invoices');

        if (Schema::hasTable('acc_persons')) {
            Schema::table('acc_persons', function (Blueprint $table): void {
                foreach (['is_blocked', 'credit_limit'] as $column) {
                    if (Schema::hasColumn('acc_persons', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
