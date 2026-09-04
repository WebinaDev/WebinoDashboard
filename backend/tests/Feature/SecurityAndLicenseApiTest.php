<?php

namespace Tests\Feature;

use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityAndLicenseApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_inactive_user_is_forbidden(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'inactive-user',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => false,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/auth/user')
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'ACCOUNT_DISABLED');
    }

    public function test_module_without_license_returns_403(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'unlicensed-mod',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);

        DashboardModule::query()->create([
            'slug' => 'blog',
            'requires_license' => true,
            'git_repo' => null,
            'default_version' => '0.1.0',
        ]);
        TenantModule::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'blog',
            'enabled' => true,
            'licensed' => false,
            'installed_version' => '0.1.0',
        ]);
        TenantSubmoduleActivation::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'blog',
            'submodule_slug' => 'posts',
            'enabled' => true,
            'licensed' => false,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/blog/posts')
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'MODULE_NOT_LICENSED');
    }

    public function test_ajax_header_required_for_cookie_mutating_requests(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 'ajax-req',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        $token = $user->createToken('spa')->plainTextToken;

        $this->withCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->withHeader('Accept', 'text/html')
            ->post('/api/v1/auth/logout')
            ->assertForbidden()
            ->assertJsonPath('errors.code', 'AJAX_REQUIRED');
    }
}
