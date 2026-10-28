<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Standalone audio/video items for the Poetry module. A media item may exist without a poem
 * (poem_id nullable) and a poem may have no media. Backfills rows from poems' legacy
 * media_ids (audio/video media_assets) and external_links (Eitaa/Aparat/… posts).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('poetry_media')) {
            Schema::create('poetry_media', function (Blueprint $t) {
                $t->id();
                $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $t->string('title', 255);
                $t->string('kind', 8)->default('audio');          // audio | video
                $t->foreignId('media_id')->nullable();             // media_assets id (uploaded file)
                $t->string('file_url', 1024)->nullable();          // direct file URL (upload or external mp3/mp4)
                $t->string('external_url', 1024)->nullable();      // Eitaa / Aparat / Telegram post or embed
                $t->string('cover', 1024)->nullable();
                $t->foreignId('occasion_id')->nullable()->constrained('poetry_terms')->nullOnDelete();
                $t->foreignId('poem_id')->nullable()->constrained('poetry_poems')->nullOnDelete();
                $t->string('reciter', 160)->nullable();
                $t->string('duration', 16)->nullable();
                $t->unsignedInteger('sort')->default(0);
                $t->string('status', 16)->default('published');   // draft | published
                $t->unsignedBigInteger('play_count')->default(0);
                $t->timestamps();
                $t->index(['tenant_id', 'status', 'sort']);
                $t->index(['tenant_id', 'poem_id']);
            });
        }

        $this->backfill();
    }

    public function backfill(): void
    {
        if (! Schema::hasTable('poetry_poems')) {
            return;
        }
        DB::table('poetry_poems')->orderBy('id')->chunkById(200, function ($poems) {
            foreach ($poems as $poem) {
                if (DB::table('poetry_media')->where('poem_id', $poem->id)->exists()) {
                    continue;
                }
                $now = now();
                $ids = array_values(array_filter(array_map('intval', (array) json_decode((string) $poem->media_ids, true))));
                if ($ids && Schema::hasTable('media_assets')) {
                    $assets = DB::table('media_assets')->where('tenant_id', $poem->tenant_id)->whereIn('id', $ids)->get();
                    foreach ($assets as $a) {
                        $mime = (string) ($a->mime ?? '');
                        $kind = str_starts_with($mime, 'video') ? 'video' : (str_starts_with($mime, 'audio') ? 'audio' : null);
                        if (! $kind) {
                            continue;
                        }
                        DB::table('poetry_media')->insert(['tenant_id' => $poem->tenant_id, 'title' => $poem->title, 'kind' => $kind, 'media_id' => $a->id, 'occasion_id' => $poem->occasion_id, 'poem_id' => $poem->id, 'status' => $poem->status, 'created_at' => $now, 'updated_at' => $now]);
                    }
                }
                foreach ((array) json_decode((string) $poem->external_links, true) as $l) {
                    $url = is_array($l) ? (string) ($l['url'] ?? '') : '';
                    if (! preg_match('#^https?://#i', $url)) {
                        continue;
                    }
                    $kind = preg_match('#aparat\.com|\.mp4(\?|$)#i', $url) ? 'video' : 'audio';
                    DB::table('poetry_media')->insert(['tenant_id' => $poem->tenant_id, 'title' => $poem->title, 'kind' => $kind,
                        'external_url' => mb_substr($url, 0, 1024), 'occasion_id' => $poem->occasion_id, 'poem_id' => $poem->id, 'status' => $poem->status, 'created_at' => $now, 'updated_at' => $now]);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poetry_media');
    }
};
