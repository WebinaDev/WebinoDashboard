<?php

namespace Tests\Feature;

use App\Models\CmsPage;
use App\Models\BlogPost;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicSiteTest extends TestCase
{
    use RefreshDatabase;

    protected function seedTenant(string $domain = 'localhost'): Tenant
    {
        $tenant = Tenant::query()->create([
            'name' => 'Public Demo',
            'slug' => 'public-demo',
            'domain' => $domain,
            'store_display_name' => 'Public Site',
            'active_theme_slug' => 'corporate-demo-v1',
            'setup_completed' => true,
        ]);

        return $tenant;
    }

    public function test_public_tenant_resolves_without_auth(): void
    {
        $this->seedTenant();

        $this->getJson('/api/v1/public/tenant', ['HTTP_HOST' => 'localhost'])
            ->assertOk()
            ->assertJsonPath('data.slug', 'public-demo')
            ->assertJsonPath('data.active_theme_slug', 'corporate-demo-v1');
    }

    public function test_public_home_returns_blocks(): void
    {
        $tenant = $this->seedTenant();
        BlogPost::query()->create([
            'tenant_id' => $tenant->id,
            'slug' => 'hello',
            'title' => 'Hello',
            'status' => 'published',
            'published_at' => now(),
        ]);

        $this->getJson('/api/v1/public/home', ['HTTP_HOST' => 'localhost'])
            ->assertOk()
            ->assertJsonStructure(['data' => ['tenant', 'blocks', 'blog']]);
    }

    public function test_public_cms_page(): void
    {
        $tenant = $this->seedTenant();
        CmsPage::query()->create([
            'tenant_id' => $tenant->id,
            'slug' => 'about',
            'title' => 'About',
            'body' => 'About us',
            'published' => true,
        ]);

        $this->getJson('/api/v1/public/pages/about', ['HTTP_HOST' => 'localhost'])
            ->assertOk()
            ->assertJsonPath('data.title', 'About');
    }
}
