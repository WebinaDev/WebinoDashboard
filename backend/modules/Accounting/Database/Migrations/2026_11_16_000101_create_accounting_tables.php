<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acc_fiscal_years', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('title', 100);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->boolean('is_closed')->default(false);
            $table->timestamps();
        });

        Schema::create('acc_chart_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 50);
            $table->string('name', 255);
            $table->foreignId('parent_id')->nullable()->constrained('acc_chart_accounts')->nullOnDelete();
            $table->string('type', 50);
            $table->boolean('is_postable')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('acc_journal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('fiscal_year_id')->nullable()->constrained('acc_fiscal_years')->nullOnDelete();
            $table->string('document_no', 50)->nullable();
            $table->date('document_date');
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('acc_journal_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('journal_entry_id')->constrained('acc_journal_entries')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('acc_chart_accounts')->restrictOnDelete();
            $table->decimal('debit', 18, 2)->default(0);
            $table->decimal('credit', 18, 2)->default(0);
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acc_journal_lines');
        Schema::dropIfExists('acc_journal_entries');
        Schema::dropIfExists('acc_chart_accounts');
        Schema::dropIfExists('acc_fiscal_years');
    }
};
