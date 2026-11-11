<?php

namespace Tests\Feature;

use App\Models\NavMenu;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NavMenuRoutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_manage_navigation_menus_and_storefront_can_read_them(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'nav-menu-site']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/nav-menus')->assertOk()->assertJsonPath('data', []);

        $this->postJson('/api/v1/nav-menus', [
            'name' => 'منوی اصلی',
            'slug' => 'main',
            'locations' => ['header_main'],
            'items' => [['id' => 'home', 'label' => 'خانه', 'type' => 'custom', 'url' => '/home']],
        ])->assertCreated()->assertJsonPath('data.slug', 'main');

        $this->getJson('/api/v1/public/nav-menus', ['X-Tenant-Domain' => 'localhost'])
            ->assertOk()
            ->assertJsonPath('data.locations.header_main', 'main')
            ->assertJsonPath('data.menus.main.items.0.url', '/home');

        $menu = NavMenu::query()->where('tenant_id', $tenant->id)->where('slug', 'main')->firstOrFail();
        $this->putJson("/api/v1/nav-menus/{$menu->id}", [
            'name' => 'منوی اصلی',
            'slug' => 'main',
            'locations' => ['header_main'],
            'items' => [['id' => 'home', 'label' => 'خانه', 'type' => 'custom', 'url' => '/home']],
        ])->assertOk();
    }
}
