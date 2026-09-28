<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductReview;
use App\Models\RoleCapability;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use App\Support\CapabilityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewsPortalTicketsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true]);
    }

    private function portalCustomer(): User
    {
        RoleCapability::query()->firstOrCreate(['role' => 'customer', 'capability' => 'account.portal']);
        CapabilityChecker::flushRoleCache('customer');

        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
    }

    private function product(): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p-'.uniqid(),
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

    public function test_review_spam_trash_and_legacy_rejected(): void
    {
        $admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $product = $this->product();

        $review = ProductReview::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'rating' => 3,
            'body' => 'meh',
            'status' => 'pending',
        ]);
        ProductReview::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'rating' => 1,
            'body' => 'legacy',
            'status' => 'rejected',
        ]);

        $this->patchJson('/api/v1/product-reviews/'.$review->id, ['status' => 'spam'])
            ->assertOk()
            ->assertJsonPath('data.status', 'spam');

        $this->patchJson('/api/v1/product-reviews/'.$review->id, ['status' => 'trash'])
            ->assertOk()
            ->assertJsonPath('data.status', 'trash');

        $this->patchJson('/api/v1/product-reviews/'.$review->id, ['status' => 'rejected'])
            ->assertOk()
            ->assertJsonPath('data.status', 'spam');

        $this->assertSame('spam', ProductReview::normalizeStoredStatus('rejected'));
        $this->assertSame('pending', ProductReview::normalizeStoredStatus('hold'));

        $this->getJson('/api/v1/product-reviews?status=trash')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['counts' => ['all', 'pending', 'approved', 'spam', 'trash']]]);
    }

    public function test_portal_structured_address_roundtrip(): void
    {
        $user = $this->portalCustomer();
        $this->actingAs($user, 'sanctum');

        $payload = [
            'addresses' => [[
                'label' => 'Home',
                'name' => 'Ali',
                'phone' => '09120000000',
                'province_code' => '23',
                'city' => 'Tehran',
                'address' => 'Valiasr',
                'plaque' => '12',
                'unit' => '3',
                'postcode' => '1234567890',
                'lat' => 35.7,
                'lng' => 51.4,
            ]],
        ];

        $this->patchJson('/api/v1/account/addresses', $payload)
            ->assertOk()
            ->assertJsonPath('data.addresses.0.plaque', '12')
            ->assertJsonPath('data.addresses.0.unit', '3');

        $this->getJson('/api/v1/account/addresses')
            ->assertOk()
            ->assertJsonPath('data.addresses.0.province_code', '23');

        $this->patchJson('/api/v1/account/addresses', ['addresses' => [['lat' => 'north']]])
            ->assertUnprocessable();
    }

    public function test_portal_denied_without_capability(): void
    {
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/account/addresses')->assertForbidden();
    }

    public function test_ticket_csat_only_after_answer(): void
    {
        $user = $this->portalCustomer();
        $this->actingAs($user, 'sanctum');

        $id = $this->postJson('/api/v1/account/tickets', ['subject' => 'Help', 'body' => 'Broken'])
            ->assertCreated()
            ->json('data.id');

        $this->patchJson('/api/v1/account/tickets/'.$id, ['csat_rating' => 5])
            ->assertStatus(422);

        SupportTicket::query()->whereKey($id)->update(['status' => 'closed']);

        $this->patchJson('/api/v1/account/tickets/'.$id, ['csat_rating' => 4])
            ->assertOk()
            ->assertJsonPath('data.csat_rating', 4);

        $this->patchJson('/api/v1/account/tickets/'.$id, ['csat_rating' => 9])
            ->assertUnprocessable();
    }
}
