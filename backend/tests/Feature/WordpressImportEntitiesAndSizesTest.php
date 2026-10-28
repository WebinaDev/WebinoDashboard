<?php

namespace Tests\Feature;

use App\Models\MediaAsset;
use App\Models\Product;
use App\Models\User;
use App\Models\WordpressImportJob;
use App\Services\Media\ImageSizes;
use App\Services\WordpressImport\RemoteAssetFetcher;
use App\Services\WordpressImport\SafeRemoteFetcher;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WordpressImportEntitiesAndSizesTest extends TestCase
{
    use RefreshDatabase;

    private function exportDir(array $rows): string
    {
        $dir = sys_get_temp_dir().'/wp-ent-'.uniqid();
        mkdir($dir);
        file_put_contents($dir.'/products.json', json_encode($rows, JSON_UNESCAPED_UNICODE));

        return $dir;
    }

    public function test_html_entities_are_decoded_in_names_slugs_and_terms(): void
    {
        Storage::fake('public');
        Http::fake();
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['products' => [
            ['external_id' => '5734', 'name' => 'هایلایتر شیگلم مدل Big N&#8217; Bright', 'slug' => 'sheglam-big-n-bright', 'status' => 'publish', 'regular_price' => '1000',
                'attributes' => [['name' => 'رنگ &amp; طرح', 'options' => ['Rock &#038; Roll']]]],
            ['external_id' => '5721', 'name' => 'کوشن شیگلم مدل Lock &amp;#038; Go Long-Lasting', 'slug' => 'sheglam-lock-go-long-lasting-cushion', 'status' => 'publish', 'regular_price' => '1000'],
        ]]);
        $job = $this->runAll($runner, $job);
        $this->assertSame(0, $job->progress['totals']['failed'], json_encode($job->progress['errors'] ?? []));

        $a = Product::query()->where('slug', 'sheglam-big-n-bright')->firstOrFail();
        $this->assertSame('هایلایتر شیگلم مدل Big N’ Bright', $a->name);
        $this->assertSame('publish', $a->status);
        $b = Product::query()->where('slug', 'sheglam-lock-go-long-lasting-cushion')->firstOrFail();
        $this->assertSame('کوشن شیگلم مدل Lock & Go Long-Lasting', $b->name);
        $this->assertSame('publish', $b->status);
        $this->assertSame('Big-N-Bright', app(\App\Services\WordpressImport\WordpressImportMapper::class)->slug(null, 'Big N&#8217; Bright'));
    }

    public function test_reconcile_restores_trashed_products_published_at_source_and_picks_up_new_ones(): void
    {
        Storage::fake('public');
        Http::fake();
        $job = $this->job();
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['products' => [['external_id' => '5409', 'name' => 'اسپری Lock&#8217;D In', 'slug' => 'sheglam-lockd-in-fixing-spray', 'status' => 'publish', 'regular_price' => '1000']]]);
        $this->runAll($runner, $job);
        $p = Product::query()->where('slug', 'sheglam-lockd-in-fixing-spray')->firstOrFail();
        $p->update(['status' => 'trash', 'meta' => array_merge((array) $p->meta, ['pre_trash_status' => 'publish'])]);

        // Re-export from the source: the trashed product + products added after the first import.
        $rows = [['id' => 5409, 'name' => 'اسپری Lock&#8217;D In', 'slug' => 'sheglam-lockd-in-fixing-spray', 'status' => 'publish', 'type' => 'simple', 'sku' => 'S1',
            'prices' => ['price' => '1000', 'regular_price' => '1000', 'currency_minor_unit' => 0]]];
        foreach ([8075, 8071, 8068, 8067, 8064, 8062, 8060, 8058, 8056] as $id) {
            $rows[] = ['id' => $id, 'name' => 'محصول &#8220;'.$id.'&#8221;', 'slug' => 'new-'.$id, 'status' => 'publish', 'type' => 'simple', 'sku' => 'N'.$id,
                'prices' => ['price' => '2000', 'regular_price' => '2000', 'currency_minor_unit' => 0]];
        }
        $dir = $this->exportDir($rows);

        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir])
            ->expectsOutputToContain('missing: 10')
            ->expectsOutputToContain('trash locally but published at source')
            ->assertSuccessful();
        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir, '--import' => true])->assertSuccessful();

        $restored = $p->fresh();
        $this->assertSame('publish', $restored->status);
        $this->assertSame('اسپری Lock’D In', $restored->name);
        $this->assertArrayNotHasKey('pre_trash_status', (array) $restored->meta);
        $this->assertSame(1, Product::query()->where('slug', 'sheglam-lockd-in-fixing-spray')->count());
        $this->assertSame(9, Product::query()->where('slug', 'like', 'new-%')->where('status', 'publish')->count());
        $this->assertSame('محصول “8075”', Product::query()->where('slug', 'new-8075')->value('name'));
        $this->artisan('wordpress-import:reconcile', ['job' => $job->id, '--source' => $dir])
            ->expectsOutputToContain('missing: 0')->assertSuccessful();
    }

    public function test_importer_generates_800px_card_size_and_product_exposes_it(): void
    {
        Storage::fake('public');
        $img = imagecreatetruecolor(1600, 1200);
        ob_start();
        imagejpeg($img);
        $jpg = (string) ob_get_clean();
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        Http::fake(['https://parisma.ir/p.jpg' => Http::response($jpg, 200, ['Content-Type' => 'image/jpeg'])]);
        $job = $this->job(['download_media' => true]);
        $runner = app(WordpressImportRunner::class);
        $runner->enqueue($job, ['products' => [['external_id' => '1', 'name' => 'x', 'slug' => 'x', 'status' => 'publish', 'regular_price' => '1',
            'images' => [['url' => 'https://parisma.ir/p.jpg']]]]]);
        $job = $this->runAll($runner, $job);
        $this->assertSame(0, $job->progress['totals']['failed'], json_encode($job->progress['errors'] ?? []));

        $asset = MediaAsset::query()->firstOrFail();
        $card = ImageSizes::cardPathFor($asset->path);
        Storage::disk('public')->assertExists($card);
        $size = getimagesizefromstring(Storage::disk('public')->get($card));
        $this->assertSame(800, $size[0]);
        $this->assertSame(600, $size[1]);
        $this->assertSame('image/webp', $size['mime']);

        $product = Product::query()->where('slug', 'x')->firstOrFail();
        $this->assertNotNull($product->image_card_url);
        $this->assertStringEndsWith(ImageSizes::SUFFIX, $product->image_card_url);
    }

    public function test_backfill_command_creates_card_sizes_for_existing_media(): void
    {
        Storage::fake('public');
        $tenant = $this->createTenant(['domain' => 'bf.test', 'slug' => 'bf']);
        $img = imagecreatetruecolor(1200, 900);
        ob_start();
        imagewebp($img);
        Storage::disk('public')->put('media/1/a.webp', (string) ob_get_clean());
        $small = imagecreatetruecolor(400, 300);
        ob_start();
        imagewebp($small);
        Storage::disk('public')->put('media/1/b.webp', (string) ob_get_clean());
        foreach (['a', 'b'] as $n) {
            MediaAsset::query()->create(['tenant_id' => $tenant->id, 'path' => "media/1/{$n}.webp", 'disk' => 'public', 'mime' => 'image/webp', 'size' => 1, 'original_name' => "{$n}.webp", 'title' => $n, 'slug' => $n]);
        }
        $this->artisan('media:generate-sizes')->expectsOutputToContain('Card sizes ready: 1')->assertSuccessful();
        Storage::disk('public')->assertExists('media/1/a-800w.webp');
        Storage::disk('public')->assertMissing('media/1/b-800w.webp');
        // Idempotent.
        $this->artisan('media:generate-sizes')->expectsOutputToContain('Card sizes ready: 1')->assertSuccessful();
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
