<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('support_departments')) {
            Schema::create('support_departments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name_fa', 120);
                $table->string('name_en', 120)->nullable();
                $table->string('slug', 80);
                $table->text('description_fa')->nullable();
                $table->text('description_en')->nullable();
                $table->string('color', 20)->nullable();
                $table->string('icon', 40)->nullable();
                $table->string('default_priority', 20)->default('normal');
                $table->foreignId('default_assignee_id')->nullable()->constrained('users')->nullOnDelete();
                $table->unsignedSmallInteger('sla_first_response_hours')->nullable();
                $table->unsignedSmallInteger('sla_resolve_hours')->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->json('form_fields')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'slug']);
                $table->index(['tenant_id', 'is_active', 'sort_order']);
            });
        }

        if (! Schema::hasTable('support_canned_responses')) {
            Schema::create('support_canned_responses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->nullable()->constrained('support_departments')->nullOnDelete();
                $table->string('title_fa', 160);
                $table->string('title_en', 160)->nullable();
                $table->text('body_fa');
                $table->text('body_en')->nullable();
                $table->string('category', 80)->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'is_active']);
            });
        }

        if (! Schema::hasTable('support_ticket_events')) {
            Schema::create('support_ticket_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('ticket_id')->constrained('support_tickets')->cascadeOnDelete();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('type', 40);
                $table->json('payload')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['ticket_id', 'id']);
            });
        }

        Schema::table('support_tickets', function (Blueprint $table) {
            if (! Schema::hasColumn('support_tickets', 'department_id')) {
                $table->foreignId('department_id')->nullable()->after('user_id')->constrained('support_departments')->nullOnDelete();
            }
            if (! Schema::hasColumn('support_tickets', 'priority')) {
                $table->string('priority', 20)->default('normal')->after('status');
            }
            if (! Schema::hasColumn('support_tickets', 'ticket_number')) {
                $table->string('ticket_number', 40)->nullable()->after('id');
            }
            if (! Schema::hasColumn('support_tickets', 'form_values')) {
                $table->json('form_values')->nullable()->after('subject');
            }
            if (! Schema::hasColumn('support_tickets', 'tags')) {
                $table->json('tags')->nullable()->after('form_values');
            }
            if (! Schema::hasColumn('support_tickets', 'source')) {
                $table->string('source', 30)->default('portal')->after('status');
            }
            if (! Schema::hasColumn('support_tickets', 'guest_name')) {
                $table->string('guest_name', 120)->nullable()->after('user_id');
            }
            if (! Schema::hasColumn('support_tickets', 'guest_email')) {
                $table->string('guest_email', 190)->nullable()->after('guest_name');
            }
            if (! Schema::hasColumn('support_tickets', 'guest_phone')) {
                $table->string('guest_phone', 40)->nullable()->after('guest_email');
            }
            if (! Schema::hasColumn('support_tickets', 'first_response_at')) {
                $table->timestamp('first_response_at')->nullable()->after('csat_at');
            }
            if (! Schema::hasColumn('support_tickets', 'resolve_due_at')) {
                $table->timestamp('resolve_due_at')->nullable()->after('first_response_at');
            }
            if (! Schema::hasColumn('support_tickets', 'referred_from_department_id')) {
                $table->foreignId('referred_from_department_id')->nullable()->after('department_id')->constrained('support_departments')->nullOnDelete();
            }
        });

        // Allow guest/widget tickets without a portal user.
        if (Schema::hasColumn('support_tickets', 'user_id')) {
            try {
                Schema::table('support_tickets', function (Blueprint $table) {
                    $table->dropForeign(['user_id']);
                });
            } catch (\Throwable) {
                // FK name may differ across drivers.
            }
            $driver = Schema::getConnection()->getDriverName();
            if ($driver === 'pgsql') {
                DB::statement('ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL');
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::statement('ALTER TABLE support_tickets MODIFY user_id BIGINT UNSIGNED NULL');
            }
            Schema::table('support_tickets', function (Blueprint $table) {
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            });
        }

        Schema::table('support_ticket_replies', function (Blueprint $table) {
            if (! Schema::hasColumn('support_ticket_replies', 'is_internal')) {
                $table->boolean('is_internal')->default(false)->after('is_staff');
            }
        });

        if (Schema::hasColumn('support_ticket_replies', 'user_id')) {
            try {
                Schema::table('support_ticket_replies', function (Blueprint $table) {
                    $table->dropForeign(['user_id']);
                });
            } catch (\Throwable) {
            }
            $driver = Schema::getConnection()->getDriverName();
            if ($driver === 'pgsql') {
                DB::statement('ALTER TABLE support_ticket_replies ALTER COLUMN user_id DROP NOT NULL');
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::statement('ALTER TABLE support_ticket_replies MODIFY user_id BIGINT UNSIGNED NULL');
            }
            Schema::table('support_ticket_replies', function (Blueprint $table) {
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            });
        }

        if (Schema::hasTable('support_tickets') && Schema::hasColumn('support_tickets', 'ticket_number')) {
            Schema::table('support_tickets', function (Blueprint $table) {
                $table->unique(['tenant_id', 'ticket_number']);
                $table->index(['tenant_id', 'department_id', 'status']);
                $table->index(['tenant_id', 'priority']);
                $table->index(['tenant_id', 'assignee_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('support_ticket_replies', function (Blueprint $table) {
            if (Schema::hasColumn('support_ticket_replies', 'is_internal')) {
                $table->dropColumn('is_internal');
            }
        });

        Schema::table('support_tickets', function (Blueprint $table) {
            foreach ([
                'referred_from_department_id',
                'department_id',
                'priority',
                'ticket_number',
                'form_values',
                'tags',
                'source',
                'guest_name',
                'guest_email',
                'guest_phone',
                'first_response_at',
                'resolve_due_at',
            ] as $col) {
                if (Schema::hasColumn('support_tickets', $col)) {
                    if (in_array($col, ['department_id', 'referred_from_department_id'], true)) {
                        $table->dropConstrainedForeignId($col);
                    } else {
                        $table->dropColumn($col);
                    }
                }
            }
        });

        Schema::dropIfExists('support_ticket_events');
        Schema::dropIfExists('support_canned_responses');
        Schema::dropIfExists('support_departments');
    }
};
