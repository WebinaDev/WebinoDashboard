<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductQuestion;
use App\Models\RoleCapability;
use App\Models\Tenant;
use App\Models\User;
use App\Support\CapabilityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductQuestionsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true]);
        RoleCapability::query()->firstOrCreate(['role' => 'customer', 'capability' => 'account.portal']);
        CapabilityChecker::flushRoleCache('customer');
    }

    private function product(): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Grinder',
            'slug' => 'grinder-'.uniqid(),
            'price_minor' => 1000,
            'currency' => 'IRR',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ]);
    }

    public function test_question_pending_then_answered_visible_in_portal(): void
    {
        $product = $this->product();
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        $this->actingAs($customer, 'sanctum');
        $id = $this->postJson('/api/v1/account/questions', [
            'product_id' => $product->id,
            'body' => 'Does it grind fine?',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->json('data.id');

        $this->getJson('/api/v1/account/reviews?tab=questions')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.answer', null);

        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/v1/product-questions?status=pending')
            ->assertOk()
            ->assertJsonPath('meta.counts.pending', 1)
            ->assertJsonPath('data.0.id', $id);

        $this->patchJson('/api/v1/product-questions/'.$id, ['answer' => 'Yes, 40 steps.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'answered');

        $this->assertNotNull(ProductQuestion::query()->find($id)->answered_at);

        $this->actingAs($customer, 'sanctum');
        $this->getJson('/api/v1/account/reviews?tab=questions')
            ->assertOk()
            ->assertJsonPath('data.0.status', 'answered')
            ->assertJsonPath('data.0.answer', 'Yes, 40 steps.');
    }

    public function test_question_on_foreign_tenant_product_is_rejected(): void
    {
        $other = $this->createTenant();
        $foreign = Product::query()->create([
            'tenant_id' => $other->id,
            'name' => 'X',
            'slug' => 'x-'.uniqid(),
            'price_minor' => 1,
            'currency' => 'IRR',
            'status' => 'publish',
            'type' => 'simple',
        ]);
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $this->actingAs($customer, 'sanctum');

        $this->postJson('/api/v1/account/questions', ['product_id' => $foreign->id, 'body' => 'Hello there'])
            ->assertNotFound();
    }

    public function test_trashed_question_hidden_from_portal(): void
    {
        $product = $this->product();
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        ProductQuestion::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'user_id' => $customer->id,
            'body' => 'gone',
            'status' => 'trash',
        ]);
        $this->actingAs($customer, 'sanctum');

        $this->getJson('/api/v1/account/reviews?tab=questions')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
