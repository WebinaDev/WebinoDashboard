<?php

namespace Tests\Feature;

use App\Models\BranchProductPrice;
use App\Models\Product;
use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Entities\CafeBranch;
use Tests\TestCase;

/**
 * The two screens added for features that had no UI: per-branch prices and the
 * operations thresholds.
 *
 * Both are settings a tenant changes deliberately, so the tests are about the
 * two ways such a screen goes wrong: showing another tenant's rows, and
 * overwriting values the caller did not send.
 */
class CafeBranchPricesTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'prices.test', 'slug' => 'prices']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'cafe.menu' => true,
        ]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];

        RoleCapability::query()->firstOrCreate(['role' => 'admin', 'capability' => 'branches.manage']);
        RoleCapability::query()->firstOrCreate(['role' => 'admin', 'capability' => 'settings.manage']);
    }

    private function admin(): User
    {
        return User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    /** A branch needs both names; the board shows `name_fa` in Persian, `name_en` otherwise. */
    private function branch(string $name = 'مرکزی'): CafeBranch
    {
        return CafeBranch::query()->create([
            'tenant_id' => $this->tenant->id,
            'name_fa' => $name,
            'name_en' => 'Main',
            'is_active' => true,
        ]);
    }

    private function product(string $name = 'لاته', int $priceMinor = 120000): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'price_minor' => $priceMinor,
            'currency' => 'IRT',
            'status' => 'publish',
            'is_available' => true,
        ]);
    }

    public function test_listing_returns_only_this_tenant_overrides(): void
    {
        $branch = $this->branch();
        $product = $this->product();

        BranchProductPrice::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->id,
            'product_id' => $product->id,
            'price_minor' => 150000,
            'is_available' => true,
        ]);

        // A second tenant with its own override: it must not appear.
        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'other']);
        $otherBranch = CafeBranch::query()->create([
            'tenant_id' => $other->id,
            'name_fa' => 'دیگر',
            'name_en' => 'Other',
            'is_active' => true,
        ]);
        $otherProduct = Product::query()->create([
            'tenant_id' => $other->id,
            'name' => 'چای',
            'price_minor' => 50000,
            'currency' => 'IRT',
            'status' => 'publish',
            'is_available' => true,
        ]);

        BranchProductPrice::query()->create([
            'tenant_id' => $other->id,
            'branch_id' => $otherBranch->id,
            'product_id' => $otherProduct->id,
            'price_minor' => 90000,
            'is_available' => true,
        ]);

        $res = $this->actingAs($this->admin())
            ->withHeaders($this->h)
            ->getJson('/api/v1/cafe/branch-prices')
            ->assertOk();

        $rows = $res->json('data');
        $this->assertCount(1, $rows);
        $this->assertSame(150000, $rows[0]['price_minor']);
    }

    public function test_listing_filters_by_branch(): void
    {
        $first = $this->branch('شعبه ۱');
        $second = $this->branch('شعبه ۲');
        $product = $this->product();

        foreach ([[$first, 150000], [$second, 180000]] as [$branch, $price]) {
            BranchProductPrice::query()->create([
                'tenant_id' => $this->tenant->id,
                'branch_id' => $branch->id,
                'product_id' => $product->id,
                'price_minor' => $price,
                'is_available' => true,
            ]);
        }

        $rows = $this->actingAs($this->admin())
            ->withHeaders($this->h)
            ->getJson('/api/v1/cafe/branch-prices?branch_id='.$second->id)
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame(180000, $rows[0]['price_minor']);
    }

    public function test_saving_the_same_pair_twice_replaces_the_price(): void
    {
        $branch = $this->branch();
        $product = $this->product();

        $payload = [
            'branch_id' => $branch->id,
            'product_id' => $product->id,
            'price_minor' => 150000,
        ];

        $this->actingAs($this->admin())->withHeaders($this->h)
            ->postJson('/api/v1/cafe/branch-prices', $payload)
            ->assertOk();

        $this->actingAs($this->admin())->withHeaders($this->h)
            ->postJson('/api/v1/cafe/branch-prices', [...$payload, 'price_minor' => 165000])
            ->assertOk();

        // Upsert, not insert: one row for the pair, holding the newer price.
        $this->assertSame(1, BranchProductPrice::query()
            ->where('branch_id', $branch->id)
            ->where('product_id', $product->id)
            ->count());

        $this->assertSame(165000, BranchProductPrice::query()
            ->where('branch_id', $branch->id)
            ->where('product_id', $product->id)
            ->value('price_minor'));
    }

    public function test_deleting_an_override_restores_the_catalogue_price(): void
    {
        $branch = $this->branch();
        $product = $this->product();

        $row = BranchProductPrice::query()->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branch->id,
            'product_id' => $product->id,
            'price_minor' => 150000,
            'is_available' => true,
        ]);

        $this->actingAs($this->admin())->withHeaders($this->h)
            ->deleteJson("/api/v1/cafe/branch-prices/{$row->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('branch_product_prices', ['id' => $row->id]);
    }

    public function test_operations_settings_round_trip(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->withHeaders($this->h)
            ->putJson('/api/v1/cafe/operations-settings', [
                'kds_warn_after_minutes' => 8,
                'kds_late_after_minutes' => 15,
                'enforce_delivery_minimum' => true,
            ])
            ->assertOk();

        $settings = $this->actingAs($admin)->withHeaders($this->h)
            ->getJson('/api/v1/cafe/operations-settings')
            ->assertOk()
            ->json('data.settings');

        $this->assertSame(8, (int) $settings['kds_warn_after_minutes']);
        $this->assertSame(15, (int) $settings['kds_late_after_minutes']);
        $this->assertTrue((bool) $settings['enforce_delivery_minimum']);
    }

    public function test_partial_update_keeps_untouched_thresholds(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->withHeaders($this->h)
            ->putJson('/api/v1/cafe/operations-settings', ['kds_warn_after_minutes' => 8])
            ->assertOk();

        $this->actingAs($admin)->withHeaders($this->h)
            ->putJson('/api/v1/cafe/operations-settings', ['kds_late_after_minutes' => 20])
            ->assertOk();

        $settings = $this->actingAs($admin)->withHeaders($this->h)
            ->getJson('/api/v1/cafe/operations-settings')
            ->assertOk()
            ->json('data.settings');

        // The second PUT did not mention the warning mark; it must survive untouched.
        $this->assertSame(8, (int) $settings['kds_warn_after_minutes']);
        $this->assertSame(20, (int) $settings['kds_late_after_minutes']);
    }

    public function test_out_of_range_threshold_is_rejected(): void
    {
        $this->actingAs($this->admin())->withHeaders($this->h)
            ->putJson('/api/v1/cafe/operations-settings', ['kds_warn_after_minutes' => 999])
            ->assertStatus(422);
    }
}
