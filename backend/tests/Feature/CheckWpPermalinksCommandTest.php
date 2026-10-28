<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Services\Seo\SeoSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CheckWpPermalinksCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_missing_products_and_passes_in_root_mode(): void
    {
        $tenant = $this->createTenant();
        foreach (['a-cream', 'b-toner'] as $slug) {
            Product::query()->create([
                'tenant_id' => $tenant->id, 'name' => $slug, 'slug' => $slug, 'price_minor' => 1000,
                'currency' => 'IRR', 'status' => 'publish', 'type' => 'simple',
            ]);
        }
        $dir = sys_get_temp_dir().'/wpexp'.uniqid();
        mkdir($dir);
        file_put_contents($dir.'/summary.json', json_encode(['all_product_slugs' => ['a-cream', 'b-toner', 'c-missing']]));
        file_put_contents($dir.'/products.json', json_encode([['slug' => 'a-cream', 'permalink' => 'https://x.ir/a-cream/']]));

        app(SeoSettingsService::class)->save($tenant->id, ['product_permalink_base' => '']);
        $this->artisan('webino:check-wp-permalinks', ['export' => $dir, '--tenant' => $tenant->id])
            ->expectsOutputToContain('2/3 OK')
            ->assertExitCode(1);
    }
}
