<?php

namespace Tests\Feature;

use App\Kernel\TenantActivationService;
use App\Models\MagazineArticle;
use App\Models\Product;
use App\Models\ResumeProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SiteTypeDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_ecommerce_apply_seeds_webina_products_and_theme(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => false,
            'site_type_slug' => null,
            'name' => 'فروشگاه ویبینو',
            'store_display_name' => 'فروشگاه ویبینو',
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'ecommerce');
        $tenant->refresh();

        $this->assertSame('ecommerce-starter', $tenant->active_theme_slug);
        $this->assertGreaterThanOrEqual(3, Product::query()->where('tenant_id', $tenant->id)->count());
        $this->assertDatabaseHas('products', [
            'tenant_id' => $tenant->id,
            'slug' => 'webina-starter-kit',
        ]);
    }

    public function test_resume_apply_seeds_default_profile(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => false,
            'site_type_slug' => null,
            'name' => 'آرسالان',
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'resume');
        $tenant->refresh();

        $this->assertSame('resume-default', $tenant->active_theme_slug);
        $profile = ResumeProfile::query()->where('tenant_id', $tenant->id)->first();
        $this->assertNotNull($profile);
        $this->assertNotSame('', (string) $profile->full_name);
        $this->assertTrue((bool) $profile->published);
    }

    public function test_cafe_apply_seeds_menu_items(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => false,
            'site_type_slug' => null,
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'cafe');
        $tenant->refresh();

        $this->assertSame('cafe-starter', $tenant->active_theme_slug);
        $this->assertDatabaseHas('products', [
            'tenant_id' => $tenant->id,
            'slug' => 'cafe-latte',
        ]);
    }

    public function test_magazine_apply_seeds_articles(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => false,
            'site_type_slug' => null,
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'magazine');
        $tenant->refresh();

        $this->assertSame('magazine-default', $tenant->active_theme_slug);
        $this->assertGreaterThanOrEqual(1, MagazineArticle::query()->where('tenant_id', $tenant->id)->count());
    }

    public function test_set_default_theme_endpoint(): void
    {
        $tenant = $this->createTenant([
            'site_type_slug' => 'ecommerce',
            'business_type_slug' => 'ecommerce',
            'active_theme_slug' => 'ecommerce-starter',
        ]);
        $user = User::query()->create([
            'name' => 'Admin',
            'email' => 'admin-themes@example.com',
            'password' => Hash::make('password'),
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/themes/ecommerce-classic/default', ['activate' => true])
            ->assertOk()
            ->assertJsonPath('data.default_theme_slug', 'ecommerce-classic')
            ->assertJsonPath('data.active_theme_slug', 'ecommerce-classic');

        $tenant->refresh();
        $this->assertSame('ecommerce-classic', $tenant->active_theme_slug);
        $this->assertSame('ecommerce-classic', $tenant->branding['default_theme_slug'] ?? null);
    }

    public function test_existing_site_reapply_does_not_reseed_or_clobber_theme(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => true,
            'site_type_slug' => 'ecommerce',
            'business_type_slug' => 'ecommerce',
            'active_theme_slug' => 'ecommerce-classic',
            'name' => 'فروشگاه زنده',
            'branding' => ['demo_seeded_at' => now()->toIso8601String()],
        ]);

        // Simulate merchant content that must survive upgrades / re-apply.
        Product::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'محصول واقعی',
            'slug' => 'real-merchant-product',
            'status' => 'publish',
            'type' => 'simple',
            'catalog_visibility' => 'visible',
            'price_minor' => 100000,
            'currency' => 'IRT',
            'stock_status' => 'instock',
            'is_available' => true,
        ]);

        app(TenantActivationService::class)->applySiteType($tenant->fresh(), 'ecommerce');
        $tenant->refresh();

        $this->assertSame('ecommerce-classic', $tenant->active_theme_slug);
        $this->assertSame(1, Product::query()->where('tenant_id', $tenant->id)->count());
        $this->assertDatabaseHas('products', [
            'tenant_id' => $tenant->id,
            'slug' => 'real-merchant-product',
        ]);
        $this->assertDatabaseMissing('products', [
            'tenant_id' => $tenant->id,
            'slug' => 'webina-starter-kit',
        ]);
    }

    public function test_second_apply_on_unfinished_site_skips_demo_after_flag(): void
    {
        $tenant = $this->createTenant([
            'setup_completed' => false,
            'site_type_slug' => null,
            'name' => 'فروشگاه ویبینو',
        ]);

        app(TenantActivationService::class)->applySiteType($tenant, 'ecommerce');
        $tenant->refresh();
        $this->assertNotEmpty($tenant->branding['demo_seeded_at'] ?? null);
        $countAfterFirst = Product::query()->where('tenant_id', $tenant->id)->count();
        $this->assertGreaterThanOrEqual(3, $countAfterFirst);

        $tenant->active_theme_slug = 'ecommerce-classic';
        $tenant->save();

        app(TenantActivationService::class)->applySiteType($tenant->fresh(), 'ecommerce');
        $tenant->refresh();

        $this->assertSame('ecommerce-classic', $tenant->active_theme_slug);
        $this->assertSame($countAfterFirst, Product::query()->where('tenant_id', $tenant->id)->count());
    }
}
