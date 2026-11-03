<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounting_journals', function (Blueprint $table) {
            if (! Schema::hasColumn('accounting_journals', 'order_id')) {
                $table->foreignId('order_id')->nullable()->after('tenant_id')->constrained('orders')->nullOnDelete();
            }
            if (! Schema::hasColumn('accounting_journals', 'source')) {
                $table->string('source', 32)->default('manual')->after('status');
            }
        });

        Schema::table('accounting_persons', function (Blueprint $table) {
            if (! Schema::hasColumn('accounting_persons', 'national_id')) {
                $table->string('national_id', 32)->nullable()->after('phone');
            }
            if (! Schema::hasColumn('accounting_persons', 'economic_code')) {
                $table->string('economic_code', 32)->nullable()->after('national_id');
            }
            if (! Schema::hasColumn('accounting_persons', 'meta')) {
                $table->json('meta')->nullable()->after('economic_code');
            }
        });

        if (! Schema::hasTable('accounting_invoices')) {
            Schema::create('accounting_invoices', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->foreignId('person_id')->nullable()->constrained('accounting_persons')->nullOnDelete();
                $table->foreignId('journal_id')->nullable()->constrained('accounting_journals')->nullOnDelete();
                $table->string('number', 64);
                $table->string('type', 24)->default('sale');
                $table->string('status', 24)->default('draft');
                $table->date('issue_date');
                $table->unsignedBigInteger('subtotal_minor')->default(0);
                $table->unsignedBigInteger('discount_minor')->default(0);
                $table->unsignedBigInteger('tax_minor')->default(0);
                $table->unsignedBigInteger('total_minor')->default(0);
                $table->string('currency', 8)->default('IRR');
                $table->string('moadian_status', 32)->nullable();
                $table->string('moadian_reference', 128)->nullable();
                $table->unsignedTinyInteger('moadian_pattern')->default(1);
                $table->string('buyer_register_number', 64)->nullable();
                $table->json('buyer_tax')->nullable();
                $table->json('meta')->nullable();
                $table->timestamp('moadian_sent_at')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'number']);
                $table->index(['tenant_id', 'order_id']);
                $table->index(['tenant_id', 'moadian_status']);
                $table->index(['tenant_id', 'status']);
            });
        }

        if (! Schema::hasTable('accounting_invoice_lines')) {
            Schema::create('accounting_invoice_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('invoice_id')->constrained('accounting_invoices')->cascadeOnDelete();
                $table->unsignedBigInteger('product_id')->nullable();
                $table->string('description');
                $table->string('sku', 64)->nullable();
                $table->string('sstid', 64)->nullable();
                $table->decimal('qty', 14, 4)->default(1);
                $table->unsignedBigInteger('unit_price_minor')->default(0);
                $table->unsignedBigInteger('discount_minor')->default(0);
                $table->unsignedBigInteger('tax_minor')->default(0);
                $table->decimal('vat_rate', 8, 2)->default(0);
                $table->unsignedBigInteger('total_minor')->default(0);
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('accounting_moadian_jobs')) {
            Schema::create('accounting_moadian_jobs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('invoice_id')->constrained('accounting_invoices')->cascadeOnDelete();
                $table->string('action', 24)->default('send');
                $table->string('status', 24)->default('pending');
                $table->unsignedSmallInteger('attempts')->default(0);
                $table->text('last_error')->nullable();
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->string('reference_number', 128)->nullable();
                $table->timestamp('run_after')->nullable();
                $table->timestamp('processed_at')->nullable();
                $table->timestamps();
                $table->index(['tenant_id', 'status']);
                $table->index(['invoice_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_moadian_jobs');
        Schema::dropIfExists('accounting_invoice_lines');
        Schema::dropIfExists('accounting_invoices');

        Schema::table('accounting_persons', function (Blueprint $table) {
            if (Schema::hasColumn('accounting_persons', 'meta')) {
                $table->dropColumn('meta');
            }
            if (Schema::hasColumn('accounting_persons', 'economic_code')) {
                $table->dropColumn('economic_code');
            }
            if (Schema::hasColumn('accounting_persons', 'national_id')) {
                $table->dropColumn('national_id');
            }
        });

        Schema::table('accounting_journals', function (Blueprint $table) {
            if (Schema::hasColumn('accounting_journals', 'order_id')) {
                $table->dropConstrainedForeignId('order_id');
            }
            if (Schema::hasColumn('accounting_journals', 'source')) {
                $table->dropColumn('source');
            }
        });
    }
};
