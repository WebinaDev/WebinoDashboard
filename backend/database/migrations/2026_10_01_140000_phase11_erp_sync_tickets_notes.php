<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('support_tickets')) {
            Schema::table('support_tickets', function (Blueprint $table) {
                if (! Schema::hasColumn('support_tickets', 'assignee_id')) {
                    $table->foreignId('assignee_id')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
                }
                if (! Schema::hasColumn('support_tickets', 'erp_ticket_id')) {
                    $table->unsignedBigInteger('erp_ticket_id')->nullable()->after('assignee_id')->index();
                }
                if (! Schema::hasColumn('support_tickets', 'converted_task_id')) {
                    $table->unsignedBigInteger('converted_task_id')->nullable()->after('erp_ticket_id');
                }
            });
        }

        if (! Schema::hasTable('customer_notes')) {
            Schema::create('customer_notes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('customer_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedBigInteger('erp_account_id')->nullable()->index();
                $table->unsignedBigInteger('erp_note_id')->nullable()->index();
                $table->string('subject', 255)->nullable();
                $table->text('body');
                $table->timestamps();
                $table->index(['tenant_id', 'customer_user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_notes');
        if (Schema::hasTable('support_tickets')) {
            Schema::table('support_tickets', function (Blueprint $table) {
                if (Schema::hasColumn('support_tickets', 'converted_task_id')) {
                    $table->dropColumn('converted_task_id');
                }
                if (Schema::hasColumn('support_tickets', 'erp_ticket_id')) {
                    $table->dropColumn('erp_ticket_id');
                }
                if (Schema::hasColumn('support_tickets', 'assignee_id')) {
                    $table->dropConstrainedForeignId('assignee_id');
                }
            });
        }
    }
};
