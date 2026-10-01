<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Reports\OrderReports;
use App\Services\WordpressImport\RemoteAssetFetcher;
use App\Services\WordpressImport\SafeRemoteFetcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WordpressImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_sample_fixture_imports_catalog_content_orders_and_is_idempotent(): void
    {
        Storage::fake('public');
        Http::fake();
        [$admin] = $this->operator();
        $fixture = json_decode((string) file_get_contents(base_path('tests/Fixtures/wordpress/parisma-sample.json')), true);

        $jobId = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/import/wordpress/start', [
                'source_url' => 'https://parisma.ir/',
                'currency' => 'IRT',
                'price_multiplier' => 1,
                'publish_content' => false,
            ])->assertCreated()
            ->json('data.id');

        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/upload', $fixture)
            ->assertOk()
            ->assertJsonPath('data.accepted', 10);

        $done = $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 50])
            ->assertOk()
            ->json('data');
        $this->assertSame('completed', $done['status']);
        $this->assertSame(0, $done['progress']['totals']['failed']);
        $this->assertSame(1, $done['stats']['sales_orders']);
        $this->assertSame(198000, $done['stats']['revenue_minor']);
        $this->assertSame('2026-03', $done['stats']['by_period'][0]['period']);
        $this->assertSame(198000, $done['stats']['snapshots'][0]['revenue_minor']);

        $product = Product::query()->where('slug', 'rose-lipstick')->firstOrFail();
        $this->assertSame('رژ لب رز', $product->name);
        $this->assertSame(120000, $product->price_minor);
        $this->assertSame(99000, $product->sale_price_minor);
        $this->assertTrue($product->is_hidden);
        $this->assertSame('draft', $product->status);
        $this->assertCount(2, $product->variants);
        $this->assertSame('LIP-ROSE-1', $product->variants[0]->sku);
        $this->assertNotNull($product->image_url);
        $this->assertSame('رژ لب', $product->category?->name);
        $this->assertSame('آرایش صورت', $product->category?->parent?->name);
        $this->assertTrue($product->tags()->where('slug', 'new')->exists());

        $order = Order::query()->where('number', 'WP-5001')->firstOrFail();
        $this->assertSame('completed', $order->status);
        $this->assertSame(198000, $order->total_minor);
        $this->assertSame('سارا کریمی', $order->user?->name);
        $this->assertSame('customer', $order->user?->role);
        $this->assertSame('2026-03-15', $order->created_at?->format('Y-m-d'));
        $this->assertSame(2, (int) $order->items()->first()?->quantity);
        $this->assertSame($product->id, $order->items()->first()?->product_id);

        $page = CmsPage::query()->where('slug', 'about-parisma')->firstOrFail();
        $this->assertFalse($page->published);
        $this->assertSame('html', $page->builder_draft['sections'][0]['columns'][0]['widgets'][1]['type']);
        $this->assertStringContainsString('پریسما', $page->builder_draft['sections'][0]['columns'][0]['widgets'][1]['props']['html']);

        $post = BlogPost::query()->where('slug', 'spring-skin')->firstOrFail();
        $this->assertSame('draft', $post->status);
        $this->assertSame('زیبایی', $post->category?->name);

        $header = BuilderTemplate::query()->where('kind', 'header')->firstOrFail();
        $this->assertNull($header->published);
        $encoded = json_encode($header->draft, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $this->assertStringContainsString('فروشگاه|/shop', (string) $encoded);
        $this->assertStringContainsString('رژ لب|/product-category/lipstick', (string) $encoded);

        Http::assertNothingSent();

        $this->patchJson('/api/v1/import/wordpress/jobs/'.$jobId, [
            'publish_content' => true,
        ])->assertOk();
        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/upload', $fixture)->assertOk();
        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 50])->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->assertSame(1, Product::query()->where('tenant_id', $admin->tenant_id)->count());
        $this->assertSame(1, Order::query()->where('tenant_id', $admin->tenant_id)->count());
        $product->refresh();
        $this->assertSame('publish', $product->status);
        $this->assertFalse($product->is_hidden);

        $report = app(OrderReports::class)->buildReport(
            (int) $admin->tenant_id,
            strtotime('2026-03-01'),
            strtotime('2026-03-31 23:59:59'),
            'month',
            OrderReports::salesStatuses(),
        );
        $this->assertSame(1, $report['summary']['order_count']);
        $this->assertSame(198000, $report['summary']['revenue']);
    }

    public function test_dry_run_and_private_probe_do_not_write_or_fetch(): void
    {
        Http::fake();
        [$admin] = $this->operator();
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/import/wordpress/probe', [
            'source_url' => 'http://127.0.0.1/wp-json',
        ])->assertStatus(422);
        $this->postJson('/api/v1/import/wordpress/probe', [
            'source_url' => 'http://169.254.169.254/latest/meta-data',
        ])->assertStatus(422);

        $jobId = $this->postJson('/api/v1/import/wordpress/start', [
            'source_url' => 'https://parisma.ir',
            'dry_run' => true,
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/batches', [
            'resource' => 'woo_products',
            'items' => [[
                'external_id' => '9',
                'name' => 'کرم',
                'price' => '10',
                'images' => [['url' => 'http://127.0.0.1/secret.jpg']],
            ]],
        ])->assertOk();

        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 10])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed_with_errors');

        $this->assertSame(0, Product::query()->count());
        Http::assertNothingSent();
    }

    public function test_plugin_token_can_ping(): void
    {
        [$admin] = $this->operator();
        $plain = $admin->createToken('wordpress-import:parisma', ['wordpress-import'])->plainTextToken;

        $this->withToken($plain)->postJson('/api/v1/import/wordpress/ping', [])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready');
    }

    public function test_plugin_token_is_limited_to_import_and_batches_are_resumed(): void
    {
        Storage::fake('public');
        [$admin] = $this->operator();
        $plain = $admin->createToken('wordpress-import:parisma', ['wordpress-import'])->plainTextToken;

        $this->withToken($plain)->getJson('/api/v1/auth/user')->assertForbidden();
        $this->withToken($plain)->postJson('/api/v1/import/wordpress/tokens', [
            'name' => 'another',
        ])->assertForbidden();

        $created = $this->withToken($plain)->postJson('/api/v1/import/wordpress/ingest', [
            'source_url' => 'https://parisma.ir',
            'resource' => 'products',
            'currency' => 'IRT',
            'items' => [[
                'external_id' => 'bad',
            ], [
                'external_id' => 'ok',
                'name' => 'سرم',
                'regular_price' => '50000',
                'status' => 'publish',
            ]],
        ])->assertCreated();
        $jobId = $created->json('data.job.id');

        $this->withToken($plain)->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 10])
            ->assertOk()
            ->assertJsonPath('data.progress.totals.failed', 1)
            ->assertJsonPath('data.status', 'completed_with_errors');
        $this->assertSame(1, Product::query()->count());

        $this->withToken($plain)->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/batches', [
            'resource' => 'products',
            'items' => [[
                'external_id' => 'bad',
                'name' => 'اصلاح‌شده',
                'regular_price' => '1000',
            ]],
        ])->assertOk();
        $this->withToken($plain)->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/retry')->assertOk();
        $this->withToken($plain)->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/resume', ['limit' => 10])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.progress.totals.failed', 0);
        $this->assertSame(2, Product::query()->count());
    }

    public function test_media_download_stays_on_the_allowlist(): void
    {
        Storage::fake('public');
        $jpeg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=');
        $this->app->instance(RemoteAssetFetcher::class, new SafeRemoteFetcher(fn (string $host): array => ['93.184.216.34']));
        Http::fake([
            'https://parisma.ir/*' => Http::response($jpeg, 200, ['Content-Type' => 'image/jpeg']),
            'https://evil.example/*' => Http::response($jpeg, 200, ['Content-Type' => 'image/jpeg']),
        ]);
        [$admin] = $this->operator();
        $this->actingAs($admin, 'sanctum');
        $jobId = $this->postJson('/api/v1/import/wordpress/start', [
            'source_url' => 'https://parisma.ir',
            'media_hosts' => ['cdn.example'],
            'publish_content' => true,
        ])->json('data.id');

        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/batches', [
            'resource' => 'media',
            'items' => [[
                'external_id' => 'img-1',
                'url' => 'https://parisma.ir/wp-content/uploads/rose.jpg',
                'alt' => 'رژ',
            ], [
                'external_id' => 'img-2',
                'url' => 'https://evil.example/secret.jpg',
            ]],
        ])->assertOk();
        $result = $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 10])
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $result['progress']['totals']['failed']);
        $this->assertSame(1, $result['progress']['totals']['done']);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'parisma.ir'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'evil.example'));
    }

    public function test_customer_email_from_another_tenant_is_not_taken_over(): void
    {
        [$admin, $tenant] = $this->operator();
        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'other-shop']);
        User::factory()->create([
            'tenant_id' => $other->id,
            'email' => 'shared@example.com',
            'name' => 'Other tenant',
            'role' => 'customer',
        ]);
        $this->actingAs($admin, 'sanctum');
        $jobId = $this->postJson('/api/v1/import/wordpress/start', [
            'source_url' => 'https://parisma.ir',
        ])->json('data.id');
        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/batches', [
            'resource' => 'customers',
            'items' => [[
                'external_id' => '77',
                'name' => 'مشتری پریسما',
                'email' => 'shared@example.com',
            ]],
        ]);
        $this->postJson('/api/v1/import/wordpress/jobs/'.$jobId.'/run', ['limit' => 5])->assertOk();

        $this->assertSame('Other tenant', User::query()->where('email', 'shared@example.com')->firstOrFail()->name);
        $imported = User::query()->where('tenant_id', $tenant->id)->where('role', 'customer')->firstOrFail();
        $this->assertStringEndsWith('@import.webino.invalid', $imported->email);
        $this->assertSame('مشتری پریسما', $imported->name);
    }

    /** @return array{0: User, 1: Tenant} */
    private function operator(): array
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'parisma', 'default_currency' => 'IRT']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        return [$admin, $tenant];
    }
}
