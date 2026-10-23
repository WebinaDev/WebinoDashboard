<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poetry_terms', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $t->string('kind', 16); // occasion | figure | style | meter
            $t->string('slug', 120);
            $t->string('name', 160);
            $t->text('description')->nullable();
            $t->string('image', 512)->nullable();
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
            $t->unique(['tenant_id', 'kind', 'slug']);
        });

        Schema::create('poetry_poems', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $t->string('slug', 190);
            $t->string('title', 255);
            $t->text('excerpt')->nullable();
            $t->foreignId('occasion_id')->nullable()->constrained('poetry_terms')->nullOnDelete();
            $t->foreignId('meter_id')->nullable()->constrained('poetry_terms')->nullOnDelete();
            $t->string('style_label', 160)->nullable();   // free text e.g. «نوحه زنجیرزنی حماسی»
            $t->string('pen_name', 80)->nullable();        // signature e.g. «طه»
            $t->string('composed_label', 80)->nullable();  // e.g. «خرداد ۱۳۹۸»
            $t->string('melody_credit', 255)->nullable();  // e.g. «تیتر: ما ادری»
            $t->json('flags')->nullable();                 // {is_new, not_performed, rewritten}
            $t->boolean('refrain_after_each')->default(true);
            $t->json('media_ids')->nullable();             // media_assets ids (same tenant)
            $t->json('external_links')->nullable();        // [{label,url}] Telegram/Eitaa posts
            $t->json('seo')->nullable();
            $t->string('status', 16)->default('draft');
            $t->timestamp('published_at')->nullable();
            $t->unsignedBigInteger('view_count')->default(0);
            $t->longText('search_text')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'slug']);
            $t->index(['tenant_id', 'status', 'published_at']);
        });

        Schema::create('poetry_stanzas', function (Blueprint $t) {
            $t->id();
            $t->foreignId('poem_id')->constrained('poetry_poems')->cascadeOnDelete();
            $t->unsignedInteger('position')->default(0);
            $t->string('type', 16)->default('stanza'); // title | stanza | refrain
            $t->string('layout', 16)->default('couplet'); // couplet (lines paired as beyt) | single
            $t->unsignedTinyInteger('repeat')->default(1);
            $t->string('note', 255)->nullable();
            $t->json('lines');
            $t->timestamps();
        });

        Schema::create('poetry_poem_term', function (Blueprint $t) {
            $t->foreignId('poem_id')->constrained('poetry_poems')->cascadeOnDelete();
            $t->foreignId('term_id')->constrained('poetry_terms')->cascadeOnDelete();
            $t->primary(['poem_id', 'term_id']);
        });

        // Default taxonomies are seeded per tenant on first use (App\Services\Poetry\PoetryTaxonomy).
    }

    public function down(): void
    {
        Schema::dropIfExists('poetry_poem_term');
        Schema::dropIfExists('poetry_stanzas');
        Schema::dropIfExists('poetry_poems');
        Schema::dropIfExists('poetry_terms');
    }
};
