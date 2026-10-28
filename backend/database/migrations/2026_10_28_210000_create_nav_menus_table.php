<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Site navigation menus (WordPress-style «منوها»): item tree + assigned theme locations. Not the cafe `menus` table. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('nav_menus')) {
            return;
        }
        Schema::create('nav_menus', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $t->string('name', 120);
            $t->string('slug', 120);
            $t->json('items')->nullable();     // tree: [{id,label,type,ref,url,icon,badge,badge_color,new_tab,visibility,mega,children:[]}]
            $t->json('locations')->nullable(); // ["header_main","top_bar","footer_1",...]
            $t->timestamps();
            $t->unique(['tenant_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nav_menus');
    }
};
