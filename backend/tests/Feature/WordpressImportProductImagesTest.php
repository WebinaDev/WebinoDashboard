<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductMedia;
use App\Models\User;
use App\Models\WordpressImportItem;
use App\Models\WordpressImportJob;
use App\Services\WordpressImport\ImportUrlGuard;
use App\Services\WordpressImport\RemoteAssetFetcher;
use App\Services\WordpressImport\SafeRemoteFetcher;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WordpressImportProductImagesTest extends TestCase
{
    use RefreshDatabase;

    private function png(int $w = 400, int $h = 400): string
    {
        $img = imagecreatetruecolor($w, $h);
        ob_start();
        imagepng($img);

        return (string) ob_get_clean();
    }

    public function test_urls_with_spaces_and_persian_are_percent_encoded(): void
    {
        $this->assertSame(
            'https://parisma.ir/wp-content/uploads/a%20b-%D8%B4%DB%8C%E2%80%8C%DA%AF.png',
            ImportUrlGuard::normalize("https://parisma.ir/wp-content/uploads/a b-شی\u{200C}گ.png")
        );
        $this->assertSame('https://parisma.ir/x%20y.png', ImportUrlGuard::normalize('https://parisma.ir/x%20y.png'));
        ImportUrlGuard::parseHttp(ImportUrlGuard::normalize('https://parisma.ir/a b،c.jpg'));
        $this->assertTrue(true);
    }

    public function test_store_api_images_are_downloaded_as_webp_and_set_the_card_image(): void
    {
        Storage::fake('public');
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        Http::fake(['https://parisma.ir/*' => Http::response($this->png(), 200, ['Content-Type' => 'image/png'])]);
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['products' => [[
            'external_id' => '8067', 'name' => 'COSRX Peptide 132', 'slug' => 'cosrx-peptide-132-shampoo', 'regular_price' => '1000',
            'images' => [['id' => 9001, 'src' => 'https://parisma.ir/wp-content/uploads/2026/10/شامپو کوزارکس.png', 'alt' => 'x']],
        ]]]);
        $job = $this->runAll($runner, $job);

        $this->assertSame(0, $job->progress['totals']['failed'], json_encode($job->progress['errors'] ?? []));
        $product = Product::query()->where('slug', 'cosrx-peptide-132-shampoo')->firstOrFail();
        $this->assertNotNull($product->image_url);
        $this->assertStringEndsWith('.webp', $product->image_url);
        $this->assertSame($product->image_url, $product->cover_image_url);
        $this->assertSame($product->image_url, $product->image_card_url);
        $this->assertTrue(ProductMedia::query()->where('product_id', $product->id)->where('is_cover', true)->exists());
    }

    public function test_failed_images_mark_item_failed_and_retry_or_reconcile_fixes_them(): void
    {
        Storage::fake('public');
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        $ok = false;
        Http::fake(function () use (&$ok) {
            return $ok ? Http::response($this->png(), 200, ['Content-Type' => 'image/png']) : Http::response('', 503);
        });
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $row = ['id' => 8058, 'name' => 'Maybelline Glow', 'slug' => 'maybelline-instant-perfector-4-in-1-glow', 'regular_price' => '1000',
            'images' => [['id' => 9100, 'src' => 'https://parisma.ir/wp-content/uploads/2026/10/glow.webp']]];
        $runner->enqueue($job, ['products' => [$row + ['external_id' => '8058']]]);
        $job = $this->runAll($runner, $job);

        $product = Product::query()->where('slug', 'maybelline-instant-perfector-4-in-1-glow')->firstOrFail();
        $this->assertNull($product->image_url);
        $item = WordpressImportItem::query()->where('job_id', $job->id)->where('external_id', '8058')->firstOrFail();
        $this->assertSame('failed', $item->status);

        // reconcile flags the imageless product and re-imports it
        $dir = sys_get_temp_dir().'/wp-img-'.uniqid();
        mkdir($dir);
        file_put_contents($dir.'/products.json', json_encode([$row]));
        $ok = true;
        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir, '--import' => true])->assertSuccessful();
        $this->artisan('wordpress-import:run', ['job' => $job->id])->assertSuccessful();

        $product->refresh();
        $this->assertNotNull($product->image_url);
        $this->assertSame($product->image_url, $product->cover_image_url);
        $this->assertSame(1, ProductMedia::query()->where('product_id', $product->id)->where('is_cover', true)->count());
        $this->assertSame('done', $item->fresh()->status);
    }

    public function test_failed_redownload_keeps_existing_cover(): void
    {
        Storage::fake('public');
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        $ok = true;
        Http::fake(function () use (&$ok) {
            return $ok ? Http::response($this->png(), 200, ['Content-Type' => 'image/png']) : Http::response('', 503);
        });
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $row = ['external_id' => '5', 'name' => 'Keep', 'slug' => 'keep', 'regular_price' => '1000', 'images' => ['https://parisma.ir/a.png']];
        $runner->enqueue($job, ['products' => [$row]]);
        $this->runAll($runner, $job);
        $cover = Product::query()->where('slug', 'keep')->value('image_url');
        $this->assertNotNull($cover);

        $ok = false;
        $runner->enqueue($job, ['products' => [array_merge($row, ['images' => ['https://parisma.ir/new.png']])]]);
        $this->runAll($runner, $job);
        $product = Product::query()->where('slug', 'keep')->firstOrFail();
        $this->assertSame($cover, $product->image_url);
        $this->assertSame(1, ProductMedia::query()->where('product_id', $product->id)->count());
    }

    private function job(): WordpressImportJob
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'parisma-'.uniqid(), 'default_currency' => 'IRT']);
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);

        return WordpressImportJob::query()->create([
            'tenant_id' => $tenant->id, 'status' => 'ready', 'source_url' => 'https://parisma.ir', 'dry_run' => false,
            'created_by' => $admin->id,
            'options' => ['publish_content' => true, 'currency' => 'IRT', 'media_hosts' => ['parisma.ir'], 'download_media' => true],
        ]);
    }

    private function runAll(WordpressImportRunner $runner, WordpressImportJob $job): WordpressImportJob
    {
        for ($i = 0; $i < 10; $i++) {
            $job = $runner->tick($job->fresh(), 50);
            if (! in_array($job->status, ['ready', 'running'], true)) {
                break;
            }
        }

        return $job->fresh();
    }
}
