<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The audit trail the requirements demand: who, when, what changed, and the value before
 * and after.
 *
 * Design notes:
 * - `changes` stores only the attributes that actually moved, as `{field: {before, after}}`,
 *   so a row stays readable and a diff can be rendered without the whole model snapshot.
 * - `tenant_id` and `branch_id` are stamped on the row rather than joined later: a branch
 *   reassignment or a tenant deletion must not rewrite history.
 * - `actor_type` separates a person from the system. Automatic documents (a sale posting its
 *   journal) need to be traceable without pretending a user clicked something.
 * - Indexes follow the two ways the trail is read: per tenant by time, and per record.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('activity_logs')) {
            return;
        }

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable();

            // Who. Null actor = system/console.
            $table->unsignedBigInteger('actor_id')->nullable()->index();
            $table->string('actor_type', 32)->default('user'); // user | system | agent
            $table->string('actor_name')->nullable();

            // What. `subject_type` is the model's short class name (e.g. `CafeShift`).
            $table->string('subject_type', 96);
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label')->nullable();

            // Which action, in the past tense: `created`, `updated`, `deleted`, `approved`.
            $table->string('event', 48)->index();

            // { "field": { "before": …, "after": … } }
            $table->json('changes')->nullable();
            $table->text('description')->nullable();

            // Request context, so a disputed change can be traced to a session/IP.
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->string('url')->nullable();
            $table->string('method', 10)->nullable();

            // Correlates every row produced by one request (a bulk edit, an import).
            $table->uuid('batch_id')->nullable()->index();

            $table->timestamp('created_at')->nullable()->index();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
