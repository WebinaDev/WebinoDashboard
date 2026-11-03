<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('support_automation_rules')) {
            Schema::create('support_automation_rules', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name_fa', 160);
                $table->string('name_en', 160)->nullable();
                $table->string('trigger', 60);
                $table->json('conditions')->nullable();
                $table->json('actions')->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('priority')->default(100);
                $table->unsignedInteger('run_count')->default(0);
                $table->timestamp('last_run_at')->nullable();
                $table->timestamps();
                $table->index(['tenant_id', 'trigger', 'is_active']);
            });
        }

        if (! Schema::hasTable('support_automation_runs')) {
            Schema::create('support_automation_runs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('rule_id')->constrained('support_automation_rules')->cascadeOnDelete();
                $table->foreignId('ticket_id')->nullable()->constrained('support_tickets')->nullOnDelete();
                $table->string('status', 20)->default('running');
                $table->json('event_payload')->nullable();
                $table->json('result_payload')->nullable();
                $table->text('error')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->index(['tenant_id', 'rule_id', 'id']);
            });
        }

        if (! Schema::hasTable('support_sla_policies')) {
            Schema::create('support_sla_policies', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name_fa', 160);
                $table->string('name_en', 160)->nullable();
                $table->foreignId('department_id')->nullable()->constrained('support_departments')->nullOnDelete();
                $table->string('priority', 20)->nullable();
                $table->unsignedInteger('first_response_minutes')->default(60);
                $table->unsignedInteger('resolve_minutes')->default(1440);
                $table->boolean('business_hours_only')->default(false);
                $table->unsignedInteger('alert_before_minutes')->default(15);
                $table->foreignId('escalate_to_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'is_active', 'sort_order']);
            });
        }

        if (! Schema::hasTable('support_csat_campaigns')) {
            Schema::create('support_csat_campaigns', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name_fa', 160);
                $table->string('name_en', 160)->nullable();
                $table->string('question_fa', 500);
                $table->string('question_en', 500)->nullable();
                $table->string('thank_you_fa', 500)->nullable();
                $table->string('thank_you_en', 500)->nullable();
                $table->unsignedInteger('delay_minutes')->default(0);
                $table->json('channels')->nullable();
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->timestamps();
                $table->index(['tenant_id', 'is_active']);
            });
        }

        if (! Schema::hasTable('support_kb_categories')) {
            Schema::create('support_kb_categories', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('parent_id')->nullable()->constrained('support_kb_categories')->nullOnDelete();
                $table->string('name_fa', 160);
                $table->string('name_en', 160)->nullable();
                $table->string('slug', 100);
                $table->text('description_fa')->nullable();
                $table->text('description_en')->nullable();
                $table->boolean('is_public')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->unique(['tenant_id', 'slug']);
            });
        }

        if (! Schema::hasTable('support_kb_articles')) {
            Schema::create('support_kb_articles', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('category_id')->nullable()->constrained('support_kb_categories')->nullOnDelete();
                $table->string('title_fa', 240);
                $table->string('title_en', 240)->nullable();
                $table->string('slug', 140);
                $table->longText('body_fa');
                $table->longText('body_en')->nullable();
                $table->string('excerpt_fa', 500)->nullable();
                $table->string('excerpt_en', 500)->nullable();
                $table->json('tags')->nullable();
                $table->boolean('is_published')->default(false);
                $table->boolean('is_public')->default(true);
                $table->boolean('show_in_widget')->default(true);
                $table->unsignedInteger('view_count')->default(0);
                $table->unsignedInteger('helpful_yes')->default(0);
                $table->unsignedInteger('helpful_no')->default(0);
                $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('published_at')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'slug']);
                $table->index(['tenant_id', 'is_published', 'is_public']);
            });
        }

        if (! Schema::hasTable('support_chat_sessions')) {
            Schema::create('support_chat_sessions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('visitor_token', 64);
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('agent_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('department_id')->nullable()->constrained('support_departments')->nullOnDelete();
                $table->foreignId('ticket_id')->nullable()->constrained('support_tickets')->nullOnDelete();
                $table->string('status', 20)->default('waiting');
                $table->string('guest_name', 120)->nullable();
                $table->string('guest_email', 190)->nullable();
                $table->string('guest_phone', 40)->nullable();
                $table->timestamp('last_message_at')->nullable();
                $table->timestamp('accepted_at')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'visitor_token']);
                $table->index(['tenant_id', 'status', 'last_message_at']);
            });
        }

        if (! Schema::hasTable('support_chat_messages')) {
            Schema::create('support_chat_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('session_id')->constrained('support_chat_sessions')->cascadeOnDelete();
                $table->string('sender_type', 20);
                $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
                $table->text('body');
                $table->json('attachments')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['session_id', 'id']);
            });
        }

        Schema::table('support_tickets', function (Blueprint $table) {
            if (! Schema::hasColumn('support_tickets', 'sla_policy_id')) {
                $table->foreignId('sla_policy_id')->nullable()->after('resolve_due_at')->constrained('support_sla_policies')->nullOnDelete();
            }
            if (! Schema::hasColumn('support_tickets', 'first_response_due_at')) {
                $table->timestamp('first_response_due_at')->nullable()->after('sla_policy_id');
            }
            if (! Schema::hasColumn('support_tickets', 'sla_breached_at')) {
                $table->timestamp('sla_breached_at')->nullable()->after('first_response_due_at');
            }
            if (! Schema::hasColumn('support_tickets', 'sla_breach_type')) {
                $table->string('sla_breach_type', 30)->nullable()->after('sla_breached_at');
            }
            if (! Schema::hasColumn('support_tickets', 'sla_alerted_at')) {
                $table->timestamp('sla_alerted_at')->nullable()->after('sla_breach_type');
            }
            if (! Schema::hasColumn('support_tickets', 'resolved_at')) {
                $table->timestamp('resolved_at')->nullable()->after('sla_alerted_at');
            }
            if (! Schema::hasColumn('support_tickets', 'csat_campaign_id')) {
                $table->foreignId('csat_campaign_id')->nullable()->after('csat_at')->constrained('support_csat_campaigns')->nullOnDelete();
            }
            if (! Schema::hasColumn('support_tickets', 'csat_token')) {
                $table->string('csat_token', 64)->nullable()->after('csat_campaign_id');
            }
            if (! Schema::hasColumn('support_tickets', 'csat_requested_at')) {
                $table->timestamp('csat_requested_at')->nullable()->after('csat_token');
            }
            if (! Schema::hasColumn('support_tickets', 'csat_comment')) {
                $table->text('csat_comment')->nullable()->after('csat_requested_at');
            }
        });

        if (Schema::hasTable('support_tickets') && Schema::hasColumn('support_tickets', 'csat_token')) {
            try {
                Schema::table('support_tickets', function (Blueprint $table) {
                    $table->index(['tenant_id', 'sla_breached_at']);
                    $table->index(['tenant_id', 'first_response_due_at']);
                    $table->index(['tenant_id', 'resolve_due_at']);
                    $table->unique(['tenant_id', 'csat_token']);
                });
            } catch (\Throwable) {
                // Indexes may already exist on re-run.
            }
        }
    }

    public function down(): void
    {
        Schema::table('support_tickets', function (Blueprint $table) {
            foreach ([
                'csat_comment',
                'csat_requested_at',
                'csat_token',
                'csat_campaign_id',
                'resolved_at',
                'sla_alerted_at',
                'sla_breach_type',
                'sla_breached_at',
                'first_response_due_at',
                'sla_policy_id',
            ] as $col) {
                if (Schema::hasColumn('support_tickets', $col)) {
                    if (in_array($col, ['sla_policy_id', 'csat_campaign_id'], true)) {
                        $table->dropConstrainedForeignId($col);
                    } else {
                        $table->dropColumn($col);
                    }
                }
            }
        });

        Schema::dropIfExists('support_chat_messages');
        Schema::dropIfExists('support_chat_sessions');
        Schema::dropIfExists('support_kb_articles');
        Schema::dropIfExists('support_kb_categories');
        Schema::dropIfExists('support_csat_campaigns');
        Schema::dropIfExists('support_sla_policies');
        Schema::dropIfExists('support_automation_runs');
        Schema::dropIfExists('support_automation_rules');
    }
};
