<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductDownload;
use App\Models\ProductDownloadLog;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class DownloadLogTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, [
            'analytics.reports' => true,
            'commerce.catalog' => true,
            'commerce.orders' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    /** @return array{0: OrderItem, 1: ProductDownload, 2: Product} */
    private function purchasedDownload(string $status = 'webino-packaged'): array
    {
        Storage::fake('local');
        ShopSettings::saveDownloads($this->tenant->id, [
            'require_login' => false,
            'count_downloads' => true,
            'delivery_method' => 'force',
        ]);
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Ebook',
            'slug' => 'ebook',
            'price_minor' => 1000,
            'currency' => 'IRR',
            'status' => 'publish',
            'type' => 'downloadable',
        ]);
        Storage::disk('local')->put('downloads/t/ebook.pdf', 'pdf');
        $dl = ProductDownload::query()->create([
            'tenant_id' => $this->tenant->id,
            'product_id' => $product->id,
            'name' => 'ebook',
            'storage_path' => 'downloads/t/ebook.pdf',
            'original_name' => 'ebook.pdf',
        ]);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => $status,
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRR',
        ]);
        $item = OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'unit_price_minor' => 1000,
            'requires_login' => false,
        ]);

        return [$item, $dl, $product];
    }

    public function test_download_writes_log_row_and_shows_in_report(): void
    {
        [$item, $dl, $product] = $this->purchasedDownload();
        $url = URL::temporarySignedRoute('downloads.serve', now()->addMinutes(10), [
            'orderItem' => $item->id,
            'download' => $dl->id,
        ]);

        $this->get($url)->assertOk();
        $this->get($url)->assertOk();

        $this->assertSame(2, (int) $item->fresh()->download_count);
        $this->assertSame(2, ProductDownloadLog::query()->where('tenant_id', $this->tenant->id)->count());
        $log = ProductDownloadLog::query()->first();
        $this->assertSame($product->id, (int) $log->product_id);
        $this->assertSame($item->id, (int) $log->order_item_id);

        $from = now()->subDay()->timestamp;
        $to = now()->addDay()->timestamp;
        $data = $this->getJson("/api/v1/reports/downloads?from={$from}&to={$to}")->assertOk()->json('data');
        $this->assertSame(1, $data['total']);
        $this->assertSame(['product_id' => $product->id, 'name' => 'Ebook', 'downloads' => 2], $data['items'][0]);

        $old = $this->getJson('/api/v1/reports/downloads?from='.now()->subDays(10)->timestamp.'&to='.now()->subDays(5)->timestamp)
            ->assertOk()->json('data');
        $this->assertSame(0, $old['total']);
    }

    public function test_unpaid_order_download_is_rejected_without_log(): void
    {
        [$item, $dl] = $this->purchasedDownload('pending_payment');
        $url = URL::temporarySignedRoute('downloads.serve', now()->addMinutes(10), [
            'orderItem' => $item->id,
            'download' => $dl->id,
        ]);

        $this->get($url)->assertForbidden();
        $this->assertSame(0, ProductDownloadLog::query()->count());
    }
}
