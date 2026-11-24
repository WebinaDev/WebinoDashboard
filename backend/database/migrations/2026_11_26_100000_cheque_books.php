<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cheque books — a bound stack of leaves the bank gave the shop, and which of them are used.
 *
 * `acc_checks` records a cheque once somebody writes it, which is enough to post the entry and
 * nothing like enough to run a cheque book. Three things were missing, and each one is a real
 * loss of control rather than a missing convenience:
 *
 *  - **A book has a range.** Leaves come numbered 100001–100050 in a serial the bank printed.
 *    Without the range nobody can answer "is this leaf ours?" and a cheque from a book the shop
 *    never received is indistinguishable from a mistyped number.
 *  - **A leaf is either unused or gone.** Filling in a cheque and losing the leaf look identical
 *    if you only count issued cheques. A book with 12 used and 3 missing has to say so, because
 *    the next step is telling the bank which numbers to stop.
 *  - **Cancelling leaves a hole you must be able to prove.** A spoiled cheque is recorded, not
 *    deleted, and its number is consumed — otherwise two live cheques share a serial.
 *
 * The book links to the cash account it was issued against, so "which of our accounts is missing
 * leaves" is a lookup rather than an argument.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('acc_cheque_books')) {
            Schema::create('acc_cheque_books', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('cash_account_id')->nullable()->constrained('acc_cash_accounts')->nullOnDelete();
                $table->string('title', 191);
                $table->string('bank', 191)->nullable();
                // The serial range printed on the leaves. Stored as strings: Iranian cheque
                // serials are numeric today and have leading zeros often enough that treating
                // them as integers silently rewrites them.
                $table->string('series_from', 50);
                $table->string('series_to', 50);
                // Leaves the bank voided before the shop ever used them.
                $table->unsignedInteger('void_from')->nullable();
                $table->unsignedInteger('void_to')->nullable();
                $table->boolean('is_active')->default(true);
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'is_active']);
            });
        }

        if (! Schema::hasTable('acc_cheque_leaves')) {
            Schema::create('acc_cheque_leaves', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('cheque_book_id')->constrained('acc_cheque_books')->cascadeOnDelete();
                $table->unsignedInteger('leaf_number');
                // unused | issued | cancelled | lost
                $table->string('status', 20)->default('unused');
                $table->foreignId('check_id')->nullable()->constrained('acc_checks')->nullOnDelete();
                $table->foreignId('person_id')->nullable()->constrained('acc_persons')->nullOnDelete();
                $table->decimal('amount', 18, 2)->nullable();
                $table->date('due_date')->nullable();
                $table->date('issued_on')->nullable();
                $table->text('note')->nullable();
                $table->timestamps();

                // One row per leaf per book: two live cheques cannot share a serial.
                $table->unique(['cheque_book_id', 'leaf_number']);
                $table->index(['tenant_id', 'status']);
            });
        }

        if (Schema::hasTable('acc_checks') && ! Schema::hasColumn('acc_checks', 'cheque_book_id')) {
            Schema::table('acc_checks', function (Blueprint $table): void {
                $table->foreignId('cheque_book_id')->nullable()->after('cash_account_id')
                    ->constrained('acc_cheque_books')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('acc_checks') && Schema::hasColumn('acc_checks', 'cheque_book_id')) {
            Schema::table('acc_checks', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('cheque_book_id');
            });
        }

        Schema::dropIfExists('acc_cheque_leaves');
        Schema::dropIfExists('acc_cheque_books');
    }
};
