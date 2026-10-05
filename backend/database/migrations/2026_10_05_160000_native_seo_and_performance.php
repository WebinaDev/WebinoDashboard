<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('seo_redirects')) {
            Schema::create('seo_redirects', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('from_path', 512);
                $table->string('to_path', 512);
                $table->unsignedSmallInteger('status_code')->default(301);
                $table->boolean('enabled')->default(true);
                $table->string('note', 255)->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'from_path']);
                $table->index(['tenant_id', 'enabled']);
            });
        }

        // Import WP redirects into native table when present (one-time best effort).
        if (Schema::hasTable('wordpress_redirects') && Schema::hasTable('seo_redirects')) {
            $rows = \Illuminate\Support\Facades\DB::table('wordpress_redirects')->orderBy('id')->limit(20000)->get();
            foreach ($rows as $row) {
                $from = '/'.ltrim((string) $row->from_path, '/');
                $to = '/'.ltrim((string) $row->to_path, '/');
                if ($from === '/' || $from === $to) {
                    continue;
                }
                \Illuminate\Support\Facades\DB::table('seo_redirects')->updateOrInsert(
                    ['tenant_id' => $row->tenant_id, 'from_path' => $from],
                    [
                        'to_path' => $to,
                        'status_code' => in_array((int) $row->status_code, [301, 302, 307, 308], true) ? (int) $row->status_code : 301,
                        'enabled' => true,
                        'note' => 'imported:'.(string) ($row->kind ?? 'wp'),
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('seo_redirects');
    }
};
