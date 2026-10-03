<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_impersonation_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('personal_access_token_id')->unique();
            $table->string('staff_id', 64);
            $table->string('staff_name', 191);
            $table->string('site_id', 64);
            $table->string('site_name', 191)->nullable();
            $table->string('domain', 191);
            $table->json('customer');
            $table->json('sites');
            $table->string('return_url', 500)->nullable();
            $table->string('sites_url', 500)->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_impersonation_sessions');
    }
};
