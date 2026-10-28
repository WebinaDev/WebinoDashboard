<?php

namespace Tests\Feature;

use App\Models\MediaAsset;
use App\Models\Product;
use App\Models\SeoRedirect;
use App\Models\User;
use App\Models\WordpressImportItem;
use App\Models\WordpressImportJob;
use App\Models\WordpressRedirect;
use App\Services\WordpressImport\RemoteAssetFetcher;
use App\Services\WordpressImport\SafeRemoteFetcher;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WordpressImportRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_redirects_without_target_are_resolved_or_skipped_and_permalinks_are_idempotent(): void
    {
        Storage::fake('public');
        Http::fake();
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $product = [
            'external_id' => '77', 'name' => 'کرم مرطوب کننده', 'slug' => 'moist-cream', 'status' => 'publish',
            'regular_price' => '100000', 'permalink' => 'https://parisma.ir/moist-cream/',
        ];
        $runner->enqueue($job, [
            'products' => [$product],
            'redirects' => [
                ['external_id' => 'r1', 'from' => '/old-cream/', 'target_type' => 'product', 'target_id' => '77'],
                ['external_id' => 'r2', 'from' => '/nowhere/'],
                ['external_id' => 'r3', 'from' => '/%D9%82%D8%AF%DB%8C%D9%85%DB%8C/', 'to' => '/moist-cream'],
                ['external_id' => 'r4', 'from' => '/قدیمی', 'to' => '/moist-cream'],
            ],
        ]);
        $job = $this->runAll($runner, $job);

        $this->assertSame('completed', $job->status, json_encode($job->progress['errors'] ?? []));
        $this->assertSame('/product/moist-cream', WordpressRedirect::query()->where('from_path', '/old-cream')->value('to_path'));
        $skipped = WordpressImportItem::query()->where('job_id', $job->id)->where('external_id', 'r2')->firstOrFail();
        $this->assertSame('skipped', $skipped->status);
        $this->assertStringContainsString('no target', $skipped->message);
        // Encoded and decoded Persian paths collapse to one row.
        $this->assertSame(1, WordpressRedirect::query()->where('from_path', '/قدیمی')->count());
        $this->assertTrue(SeoRedirect::query()->where('from_path', '/old-cream')->exists());

        // Re-running the same export is a no-op (no duplicate permalinks / products).
        $runner->enqueue($job, ['products' => [$product]]);
        $job = $this->runAll($runner, $job);
        $this->assertSame('completed', $job->status);
        $this->assertSame(1, Product::query()->where('tenant_id', $job->tenant_id)->count());
    }

    public function test_non_web_and_oversized_images_become_webp_and_other_files_are_attachments(): void
    {
        Storage::fake('public');
        $big = imagecreatetruecolor(3000, 1500);
        ob_start();
        imagebmp($big);
        $bmp = (string) ob_get_clean();
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        Http::fake([
            'https://parisma.ir/a.bmp' => Http::response($bmp, 200),
            'https://parisma.ir/b.zip' => Http::response("PK\x03\x04".str_repeat("\0", 60), 200),
        ]);
        $job = $this->job(['download_media' => true]);
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['media' => [
            ['external_id' => 'm1', 'url' => 'https://parisma.ir/a.bmp'],
            ['external_id' => 'm2', 'url' => 'https://parisma.ir/b.zip'],
        ]]);
        $job = $this->runAll($runner, $job);

        $this->assertSame(0, $job->progress['totals']['failed'], json_encode($job->progress['errors'] ?? []));
        $webp = MediaAsset::query()->where('mime', 'image/webp')->firstOrFail();
        $size = getimagesizefromstring(Storage::disk('public')->get($webp->path));
        $this->assertSame(2000, $size[0]);
        $this->assertSame(1000, $size[1]);
        $this->assertTrue(MediaAsset::query()->where('mime', 'like', 'application/%zip%')->exists());
    }

    public function test_stale_running_job_is_recovered_and_reset_command_works(): void
    {
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['tags' => [['external_id' => 't1', 'name' => 'جدید', 'slug' => 'new']]]);
        $job->forceFill(['status' => 'running', 'heartbeat_at' => now()->subDays(5)])->save();

        $this->artisan('wordpress-import:reset', ['--stale' => true])->assertSuccessful();
        $job->refresh();
        $this->assertSame('failed', $job->status);
        $this->assertStringContainsString('resume', (string) $job->last_error);

        $this->artisan('wordpress-import:reset', ['job' => $job->id, '--retry-failed' => true])->assertSuccessful();
        $this->assertSame('ready', $job->fresh()->status);
        $this->artisan('wordpress-import:run', ['job' => $job->id])->assertSuccessful();
        $this->assertSame('completed', $job->fresh()->status);

        // A fresh heartbeat blocks a second concurrent runner.
        $job->forceFill(['status' => 'running', 'heartbeat_at' => now()])->save();
        $this->expectException(\InvalidArgumentException::class);
        $runner->tick($job->fresh(), 10);
    }

    public function test_reconcile_reports_missing_products_from_an_export_and_reimports_them(): void
    {
        Storage::fake('public');
        Http::fake();
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['products' => [['external_id' => '1', 'name' => 'الف', 'slug' => 'a', 'sku' => 'A1']]]);
        $this->runAll($runner, $job);

        $dir = sys_get_temp_dir().'/wp-reconcile-'.uniqid();
        mkdir($dir);
        file_put_contents($dir.'/products.json', json_encode([
            ['id' => 1, 'name' => 'الف', 'slug' => 'a', 'sku' => 'A1', 'status' => 'publish', 'type' => 'simple'],
            ['id' => 2, 'name' => 'باندل', 'slug' => 'bundle', 'sku' => '', 'status' => 'private', 'type' => 'bundle',
                'images' => [], 'categories' => [['id' => 9]], 'variations' => [21]],
        ], JSON_UNESCAPED_UNICODE));
        file_put_contents($dir.'/variations.json', json_encode([['id' => 21, 'parent_id' => 2, 'sku' => 'B-1', 'regular_price' => '5000']]));

        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir])
            ->expectsOutputToContain('missing: 1')
            ->expectsOutputToContain('type bundle')
            ->assertSuccessful();
        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir, '--import' => true])->assertSuccessful();
        $this->assertTrue(Product::query()->where('slug', 'bundle')->exists());
        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir])
            ->expectsOutputToContain('missing: 0')->assertSuccessful();
    }

    public function test_out_of_stock_products_are_listed_after_in_stock_ones(): void
    {
        $tenant = $this->createTenant(['domain' => 'stock.test', 'slug' => 'stock', 'default_currency' => 'IRT']);
        $this->enableSubmodules($tenant->id, ['commerce.catalog' => true]);
        foreach ([['out', true], ['in', false]] as [$slug, $soldOut]) {
            Product::query()->create([
                'tenant_id' => $tenant->id, 'name' => $slug, 'slug' => $slug, 'price_minor' => 1000, 'currency' => 'IRT',
                'status' => 'publish', 'is_hidden' => false, 'is_available' => ! $soldOut, 'is_sold_out' => $soldOut,
                'stock_status' => $soldOut ? 'outofstock' : 'instock',
            ]);
        }
        $items = collect($this->getJson('/api/v1/public/catalog', ['X-Tenant-Domain' => 'stock.test'])->assertOk()->json('data.items'));
        $slugs = $items->pluck('slug')->all();
        $this->assertSame(['in', 'out'], array_values(array_intersect($slugs, ['in', 'out'])));
    }

    /** @param  array<string, mixed>  $options */
    private function job(array $options = []): WordpressImportJob
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'parisma-'.uniqid(), 'default_currency' => 'IRT']);
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);

        return WordpressImportJob::query()->create([
            'tenant_id' => $tenant->id, 'status' => 'ready', 'source_url' => 'https://parisma.ir', 'dry_run' => false,
            'created_by' => $admin->id,
            'options' => array_merge(['publish_content' => true, 'currency' => 'IRT', 'media_hosts' => ['parisma.ir']], $options),
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
