<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('bot_outbound_messages')) {
            Schema::create('bot_outbound_messages', function (Blueprint $t) {
                $t->id();
                $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $t->string('provider', 16);
                $t->string('chat_id', 128);
                $t->string('method', 48);
                $t->json('payload');
                $t->string('status', 16)->default('pending'); // pending|sent|dead
                $t->unsignedSmallInteger('attempts')->default(0);
                $t->text('last_error')->nullable();
                $t->timestamp('next_attempt_at')->nullable();
                $t->timestamps();
                $t->index(['status', 'next_attempt_at']);
            });
        }

        if (! Schema::hasTable('bot_channel_posts')) {
            Schema::create('bot_channel_posts', function (Blueprint $t) {
                $t->id();
                $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $t->string('provider', 16);
                $t->string('channel_id', 128);
                $t->unsignedBigInteger('product_id')->nullable();
                $t->text('text')->nullable();
                $t->string('media_url', 1024)->nullable();
                $t->string('button_text', 64)->nullable();
                $t->string('button_url', 1024)->nullable();
                $t->string('status', 16)->default('draft'); // draft|scheduled|published|failed|deleted
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('published_at')->nullable();
                $t->string('message_id', 64)->nullable();
                $t->string('source', 16)->default('manual'); // manual|auto
                $t->text('last_error')->nullable();
                $t->timestamps();
                $t->index(['tenant_id', 'provider', 'status']);
                $t->index(['status', 'scheduled_at']);
            });
        }

        if (! Schema::hasTable('security_events')) {
            Schema::create('security_events', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('tenant_id')->nullable()->index();
                $t->string('type', 32); // waf_hit|waf_block|geo_block|login_lockout|rate_limited|login_failed
                $t->string('severity', 8)->default('low');
                $t->string('ip', 64)->nullable();
                $t->string('country', 4)->nullable();
                $t->string('method', 8)->nullable();
                $t->string('path', 512)->nullable();
                $t->string('user_agent', 512)->nullable();
                $t->unsignedBigInteger('user_id')->nullable();
                $t->json('context')->nullable();
                $t->timestamp('created_at')->useCurrent();
                $t->index(['tenant_id', 'type', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('security_events');
        Schema::dropIfExists('bot_channel_posts');
        Schema::dropIfExists('bot_outbound_messages');
    }
};
