<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            if (! Schema::hasColumn('tenants', 'domain_aliases')) {
                $table->json('domain_aliases')->nullable()->after('domain');
            }
            if (! Schema::hasColumn('tenants', 'alias_subdomain')) {
                $table->string('alias_subdomain', 63)->nullable()->after('domain_aliases');
            }
        });

        Schema::create('link_hub_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('kind', 16)->default('business'); // business | member
            $table->string('slug', 64)->nullable();
            $table->string('title')->nullable();
            $table->string('avatar_url', 500)->nullable();
            $table->text('bio')->nullable();
            $table->boolean('is_published')->default(false);
            $table->json('theme_json')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'kind']);
        });

        Schema::create('link_hub_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('profile_id')->constrained('link_hub_profiles')->cascadeOnDelete();
            $table->string('type', 32); // link | contact | form | faq | event
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_visible')->default(true);
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['profile_id', 'sort']);
        });

        Schema::create('link_hub_form_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('profile_id')->constrained('link_hub_profiles')->cascadeOnDelete();
            $table->foreignId('block_id')->constrained('link_hub_blocks')->cascadeOnDelete();
            $table->json('payload')->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('link_hub_form_submissions');
        Schema::dropIfExists('link_hub_blocks');
        Schema::dropIfExists('link_hub_profiles');

        Schema::table('tenants', function (Blueprint $table) {
            if (Schema::hasColumn('tenants', 'alias_subdomain')) {
                $table->dropColumn('alias_subdomain');
            }
            if (Schema::hasColumn('tenants', 'domain_aliases')) {
                $table->dropColumn('domain_aliases');
            }
        });
    }
};
