<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->dateTime('created_at');
            $table->char('visitor_hash', 64)->index();
            $table->string('uri', 512)->default('');
            $table->unsignedBigInteger('post_id')->default(0)->index();
            $table->string('referrer', 512)->default('');
            $table->string('ref_category', 32)->default('direct');
            $table->string('ref_source', 191)->default('');
            $table->char('country', 2)->default('');
            $table->string('city', 100)->default('');
            $table->string('browser', 64)->default('');
            $table->string('os', 64)->default('');
            $table->string('device', 32)->default('');
            $table->string('utm_source', 100)->default('');
            $table->string('utm_medium', 100)->default('');
            $table->string('utm_campaign', 100)->default('');
            $table->string('session_id', 64)->default('')->index();
            $table->unsignedInteger('duration_ms')->default(0);
            $table->boolean('is_exit')->default(false);
            $table->boolean('is_bounce')->default(false);
        });

        Schema::create('analytics_visitors', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->char('visitor_hash', 64);
            $table->dateTime('first_seen');
            $table->dateTime('last_seen')->index();
            $table->unsignedInteger('hits')->default(0);
            $table->char('country', 2)->default('');
            $table->primary(['tenant_id', 'visitor_hash']);
        });

        Schema::create('analytics_daily_totals', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->date('day');
            $table->unsignedInteger('visitors')->default(0);
            $table->unsignedInteger('views')->default(0);
            $table->unsignedInteger('sessions')->default(0);
            $table->unsignedInteger('bounces')->default(0);
            $table->unsignedBigInteger('duration_sum_ms')->default(0);
            $table->primary(['tenant_id', 'day']);
        });

        Schema::create('analytics_page_daily', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->date('day');
            $table->unsignedBigInteger('post_id')->default(0);
            $table->string('uri_key', 191)->default('');
            $table->string('uri', 512)->default('');
            $table->unsignedInteger('views')->default(0);
            $table->primary(['tenant_id', 'day', 'post_id', 'uri_key'], 'analytics_page_daily_pk');
        });

        Schema::create('analytics_referrer_daily', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->date('day');
            $table->string('ref_category', 32)->default('direct');
            $table->string('ref_source', 100)->default('');
            $table->unsignedInteger('visits')->default(0);
            $table->primary(['tenant_id', 'day', 'ref_category', 'ref_source'], 'analytics_referrer_daily_pk');
        });

        Schema::create('analytics_device_daily', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->date('day');
            $table->string('dim_type', 32)->default('browser');
            $table->string('dim_value', 50)->default('');
            $table->unsignedInteger('views')->default(0);
            $table->primary(['tenant_id', 'day', 'dim_type', 'dim_value'], 'analytics_device_daily_pk');
        });

        Schema::create('analytics_geo_daily', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id');
            $table->date('day');
            $table->string('dim_type', 32)->default('country');
            $table->string('dim_value', 80)->default('');
            $table->unsignedInteger('views')->default(0);
            $table->primary(['tenant_id', 'day', 'dim_type', 'dim_value'], 'analytics_geo_daily_pk');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_geo_daily');
        Schema::dropIfExists('analytics_device_daily');
        Schema::dropIfExists('analytics_referrer_daily');
        Schema::dropIfExists('analytics_page_daily');
        Schema::dropIfExists('analytics_daily_totals');
        Schema::dropIfExists('analytics_visitors');
        Schema::dropIfExists('analytics_events');
    }
};
