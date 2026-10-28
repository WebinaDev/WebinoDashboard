<?php

namespace Tests\Feature;

use App\Models\WordpressRedirect;
use App\Services\Seo\SeoRedirectService;
use App\Services\Seo\SeoSettingsService;
use App\Services\WordpressImport\WordpressImportMapper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Live re-test: /shop → /pages/shop-2 (empty), /product/x/ not rooted, raw [woocommerce_my_account], X-Public-Cache on HEAD. */
class StoreNativeRoutesRedirectTest extends TestCase
{
    use RefreshDatabase;

    public function test_imported_wc_page_redirects_never_shadow_native_routes(): void
    {
        $t = $this->createTenant(['slug' => 'nr', 'domain' => 'nr.test']);
        foreach ([['/shop/', '/pages/shop-2'], ['/compare', '/pages/compare'], ['/my-account/', '/pages/my-account'], ['/old-shop', '/pages/shop-2'], ['/about', '/pages/about-us']] as [$f, $to]) {
            WordpressRedirect::query()->create(['tenant_id' => $t->id, 'from_path' => $f, 'to_path' => $to, 'status_code' => 301, 'kind' => 'redirect']);
        }
        $svc = app(SeoRedirectService::class);
        $this->assertNull($svc->find($t->id, '/shop'));
        $this->assertNull($svc->find($t->id, '/compare'));
        $this->assertNull($svc->find($t->id, '/my-account/'));
        $this->assertSame('/shop', $svc->find($t->id, '/old-shop')?->to_path);
        $this->assertSame('/pages/about-us', $svc->find($t->id, '/about')?->to_path);
    }

    public function test_product_base_path_301s_to_root_when_base_is_empty(): void
    {
        $t = $this->createTenant(['slug' => 'pr', 'domain' => 'pr.test']);
        $svc = app(SeoRedirectService::class);
        $this->assertNull($svc->find($t->id, '/product/serum/'));
        app(SeoSettingsService::class)->save($t->id, ['product_permalink_base' => '']);
        $row = $svc->find($t->id, '/product/serum/');
        $this->assertSame('/serum', $row?->to_path);
        $this->assertSame(301, (int) $row->status_code);
        $this->withHeader('X-Tenant-Domain', 'pr.test')->getJson('/api/v1/public/seo/redirect?path=/product/serum/')
            ->assertOk()->assertJsonPath('data.to_path', '/serum');
    }

    public function test_importer_strips_woocommerce_shortcodes(): void
    {
        $html = WordpressImportMapper::stripWooShortcodes('<p>a</p><!-- wp:shortcode -->[woocommerce_my_account]<!-- /wp:shortcode -->[woocommerce_cart foo="1"]<p>b</p>');
        $this->assertSame('<p>a</p><p>b</p>', $html);
    }

    public function test_public_cache_header_on_head_and_bypass(): void
    {
        $this->createTenant(['slug' => 'pc', 'domain' => 'localhost']);
        config(['webino_runtime.public_api_cache' => true, 'cache.default' => 'array']);
        $this->call('HEAD', '/api/v1/public/site-status')->assertHeader('X-Public-Cache');
        $this->withHeader('Authorization', 'Bearer x')->getJson('/api/v1/public/site-status')->assertHeader('X-Public-Cache', 'BYPASS');
    }
}
