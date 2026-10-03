<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('builder_templates', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'kind']);
        });

        Schema::table('builder_templates', function (Blueprint $table) {
            $table->string('slug', 120)->nullable()->after('kind');
            $table->boolean('is_default')->default(false)->after('title');
            $table->unsignedSmallInteger('priority')->default(0)->after('is_default');
            $table->json('conditions')->nullable()->after('priority');
        });

        foreach (DB::table('builder_templates')->orderBy('id')->get() as $row) {
            DB::table('builder_templates')->where('id', $row->id)->update([
                'is_default' => true,
                'slug' => $row->kind,
                'priority' => 0,
            ]);
        }

        Schema::table('builder_templates', function (Blueprint $table) {
            $table->unique(['tenant_id', 'kind', 'slug']);
        });

        Schema::create('builder_globals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->json('draft')->nullable();
            $table->json('published')->nullable();
            $table->timestamps();
            $table->unique('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('builder_globals');

        Schema::table('builder_templates', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'kind', 'slug']);
            $table->dropColumn(['slug', 'is_default', 'priority', 'conditions']);
            $table->unique(['tenant_id', 'kind']);
        });
    }
};
