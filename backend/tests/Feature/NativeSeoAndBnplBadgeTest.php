<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NativeSeoAndBnplBadgeTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'provision_token' => 'site-token',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.checkout' => true,
            'commerce.catalog' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_seo_settings_and_redirects_round_trip(): void
    {
        $this->postJson('/api/v1/seo/settings', [
            'home_title' => 'خانه ویبینو',
            'sitemap_enabled' => true,
            'sitemap_include_news' => true,
        ])->assertOk()
            ->assertJsonPath('data.home_title', 'خانه ویبینو')
            ->assertJsonPath('data.sitemap_include_news', true);

        $this->postJson('/api/v1/seo/redirects', [
            'from_path' => '/old-sale',
            'to_path' => '/shop',
            'status_code' => 301,
        ])->assertCreated()->assertJsonPath('data.from_path', '/old-sale');

        $this->getJson('/api/v1/seo/redirects')->assertOk()->assertJsonCount(1, 'data');

        $this->withHeader('Host', 'shop.test')
            ->getJson('/api/v1/public/seo/redirect?path=/old-sale')
            ->assertOk()
            ->assertJsonPath('data.to_path', '/shop');

        $this->withHeader('Host', 'shop.test')
            ->get('/api/v1/public/seo/sitemap/index')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8');

        $this->withHeader('Host', 'shop.test')
            ->get('/api/v1/public/seo/robots')
            ->assertOk()
            ->assertSee('Sitemap:', false);
    }

    public function test_installment_badges_only_for_enabled_gateways(): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, 'digipay', true);
        $gateways->save($this->tenant->id, 'digipay', [
            'client_id' => 'c',
            'client_secret' => 's',
            'username' => 'u',
            'password' => 'p',
            'installment_enabled' => true,
            'cash_enabled' => true,
            'has_pdp' => true,
        ]);
        $gateways->setGatewayEnabled($this->tenant->id, 'snapppay', true);
        $gateways->save($this->tenant->id, 'snapppay', [
            'client_id' => 'c',
            'client_secret' => 's',
            'client_username' => 'u',
            'client_password' => 'p',
            'installment_enabled' => true,
            'has_pdp' => false,
        ]);

        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p',
            'price_minor' => 100000,
            'currency' => 'IRT',
            'status' => 'publish',
        ]);

        $badges = $this->withHeader('Host', 'shop.test')
            ->getJson('/api/v1/public/payments/installment-badges?product_id='.$product->id)
            ->assertOk()
            ->json('data.badges');

        $ids = collect($badges)->pluck('id')->all();
        $this->assertContains('digipay', $ids);
        $this->assertNotContains('snapppay', $ids);
    }

    public function test_performance_settings_and_purge(): void
    {
        $this->putJson('/api/v1/performance/settings', [
            'webp_enabled' => true,
            'lazy_load' => true,
            'purge_on_product_save' => true,
            'isr_revalidate_seconds' => 90,
        ])->assertOk()->assertJsonPath('data.isr_revalidate_seconds', 90);

        $this->postJson('/api/v1/performance/purge', ['reason' => 'test'])
            ->assertOk()
            ->assertJsonPath('data.ok', true);
    }

    public function test_storefront_appearance_round_trip(): void
    {
        $this->putJson('/api/v1/shop/storefront-appearance', [
            'primary_color' => '#112233',
            'mega_menu' => true,
            'show_installment_badge' => true,
        ])->assertOk()
            ->assertJsonPath('data.primary_color', '#112233')
            ->assertJsonPath('data.show_installment_badge', true);
    }
}
