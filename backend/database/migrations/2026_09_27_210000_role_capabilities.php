<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_capabilities', function (Blueprint $table) {
            $table->id();
            $table->string('role', 64);
            $table->string('capability', 128);
            $table->timestamps();
            $table->unique(['role', 'capability']);
            $table->index('role');
        });

        Schema::create('role_menu_acl', function (Blueprint $table) {
            $table->id();
            $table->string('role', 64);
            $table->string('menu_key', 128);
            $table->boolean('allowed')->default(true);
            $table->timestamps();
            $table->unique(['role', 'menu_key']);
            $table->index('role');
        });

        $now = now();
        $rows = [];

        /** @var array<string, list<string>> $map */
        $map = [
            'admin' => ['*'],
            'staff' => [
                'users.manage',
                'rbac.manage',
                'accounting.manage',
                'pos.use',
                'reviews.moderate',
                'settings.manage',
                'commerce.*',
                'orders.*',
                'catalog.*',
                'marketing.*',
                'content.*',
                'analytics.*',
                'reports.*',
                'support.*',
                'modules.*',
            ],
            'shop_manager' => [
                'commerce.*',
                'orders.*',
                'catalog.*',
                'marketing.*',
                'pos.use',
                'accounting.manage',
                'reports.shop',
                'settings.manage',
                'reviews.moderate',
                'support.*',
            ],
            'seller' => [
                'pos.use',
                'orders.own',
            ],
            'accountant' => [
                'accounting.manage',
                'reports.shop',
            ],
            'author' => [
                'content.manage',
            ],
            'editor' => [
                'content.manage',
                'reviews.moderate',
            ],
            'customer' => [
                'account.portal',
            ],
            'partner' => [
                'account.portal',
                'partner.portal',
            ],
            'subscriber' => [
                'portal.read',
                'account.portal',
            ],
        ];

        foreach ($map as $role => $capabilities) {
            foreach ($capabilities as $capability) {
                $rows[] = [
                    'role' => $role,
                    'capability' => $capability,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        DB::table('role_capabilities')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('role_menu_acl');
        Schema::dropIfExists('role_capabilities');
    }
};
