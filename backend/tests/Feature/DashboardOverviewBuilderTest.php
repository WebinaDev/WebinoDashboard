<?php

namespace Tests\Feature;

use App\Models\DashboardModule;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardOverviewBuilderTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        foreach (['dashboard', 'catalog', 'commerce'] as $slug) {
            DashboardModule::query()->firstOrCreate(['slug' => $slug], [
                'requires_license' => false,
                'git_repo' => null,
                'default_version' => '0.1.0',
            ]);
            TenantModule::query()->create([
                'tenant_id' => $this->tenant->id,
                'module_slug' => $slug,
                'enabled' => true,
                'licensed' => true,
                'installed_version' => '0.1.0',
            ]);
        }
        $this->enableSubmodules($this->tenant->id, [
            'core.dashboard' => true,
            'commerce.catalog' => true,
            'commerce.orders' => true,
        ]);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    public function test_overview_returns_sections_and_counts_custom_status_sales(): void
    {
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Espresso',
            'slug' => 'espresso',
            'price_minor' => 100000,
            'purchase_price_minor' => 40000,
            'currency' => 'IRR',
            'status' => 'publish',
            'stock' => 5,
        ]);
        foreach (['webino-packaged', 'webino-courier', 'paid', 'cancelled', 'webino-need-review'] as $i => $status) {
            Order::query()->create([
                'tenant_id' => $this->tenant->id,
                'number' => 'ORD-'.$i,
                'status' => $status,
                'subtotal_minor' => 100000,
                'total_minor' => 100000,
                'currency' => 'IRR',
                'customer_name' => 'C'.$i,
            ])->items()->create([
                'product_id' => $product->id,
                'product_name' => 'Espresso',
                'quantity' => 1,
                'unit_price_minor' => 100000,
            ]);
        }

        $data = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/dashboard/overview?locale=en')
            ->assertOk()
            ->json('data');

        $this->assertContains('sales', $data['sections']);
        $this->assertContains('products', $data['sections']);
        $this->assertSame(3, (int) $data['sales']['summary']['order_count']);
        $this->assertSame(300000, (int) $data['sales']['summary']['revenue']);
        $this->assertSame('Espresso', $data['sales']['top_products'][0]['name']);
        $this->assertSame(3, (int) $data['sales']['top_products'][0]['quantity']);
    }
}
