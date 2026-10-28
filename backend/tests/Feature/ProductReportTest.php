<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductReport;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductReportTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true, 'core.dashboard' => true]);
        $this->product = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Mascara', 'slug' => 'mascara', 'price_minor' => 500000,
            'currency' => 'IRR', 'status' => 'publish', 'stock' => 3, 'stock_status' => 'instock',
            'is_available' => true, 'is_hidden' => false, 'type' => 'simple',
        ]);
    }

    private function report(array $body)
    {
        return $this->withHeaders(['Host' => (string) $this->tenant->domain])
            ->postJson('/api/v1/public/catalog/items/mascara/reports', $body);
    }

    public function test_lower_price_report_requires_competitor_url(): void
    {
        $this->report(['type' => 'lower_price'])->assertStatus(422)->assertJsonValidationErrors('competitor_url');
        $this->report(['type' => 'lower_price', 'competitor_url' => 'https://example.com/m', 'competitor_price_minor' => 450000, 'contact' => '09120000000'])
            ->assertCreated();
        $this->assertDatabaseHas('product_reports', ['product_id' => $this->product->id, 'type' => 'lower_price', 'competitor_price_minor' => 450000, 'status' => 'new']);
    }

    public function test_issue_report_requires_message_and_defaults_kind(): void
    {
        $this->report(['type' => 'issue'])->assertStatus(422)->assertJsonValidationErrors('message');
        $this->report(['type' => 'issue', 'message' => 'Wrong shade photo'])->assertCreated();
        $this->assertSame('other', ProductReport::query()->value('issue_kind'));
    }

    public function test_admin_lists_and_updates_reports_tenant_scoped(): void
    {
        $this->report(['type' => 'issue', 'issue_kind' => 'image', 'message' => 'x'])->assertCreated();
        $id = (int) ProductReport::query()->value('id');
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/product-reports?type=issue')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.product.slug', 'mascara')
            ->assertJsonMissingPath('data.0.ip');
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/product-reports/'.$id, ['status' => 'resolved'])
            ->assertOk()->assertJsonPath('data.status', 'resolved');

        $other = $this->createTenant();
        $foreign = User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']);
        $this->actingAs($foreign, 'sanctum')->patchJson('/api/v1/product-reports/'.$id, ['status' => 'rejected'])->assertNotFound();
    }
}
