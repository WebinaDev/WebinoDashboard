<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_form_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->index();
            $table->string('form_key', 100);
            // {email_to, sms_to, sms_text, webhook_url, redirect_url}
            $table->json('actions');
            $table->timestamps();
            $table->unique(['tenant_id', 'form_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_form_settings');
    }
};
