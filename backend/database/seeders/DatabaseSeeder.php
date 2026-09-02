<?php

namespace Database\Seeders;

use App\Kernel\ModuleRegistry;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        app(ModuleRegistry::class)->boot();

        Tenant::query()->updateOrCreate(
            ['slug' => 'demo'],
            [
                'name' => 'Demo tenant',
                'domain' => 'localhost',
                'license_key' => 'dev-license',
                'setup_completed' => false,
                'store_display_name' => null,
                'default_currency' => 'IRR',
                'default_locale' => 'fa',
                'site_type_slug' => null,
                'business_category_slug' => null,
                'business_type_slug' => null,
                'theme_preset' => null,
                'active_theme_slug' => null,
                'nav_preset' => null,
            ]
        );

        $tenant = Tenant::query()->where('slug', 'demo')->first();

        User::query()->updateOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Admin',
                'password' => Hash::make('password'),
                'password_must_change' => true,
                'tenant_id' => $tenant->id,
                'role' => 'admin',
            ]
        );
    }
}
