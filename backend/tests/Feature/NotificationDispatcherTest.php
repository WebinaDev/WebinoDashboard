<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Notifications\NotificationSettings;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NotificationDispatcherTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->tenant = $this->createTenant(['slug' => 'notify', 'domain' => 'notify.test']);
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true]);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
    }

    private function product(): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Espresso',
            'slug' => 'espresso',
            'price_minor' => 1000,
            'currency' => 'IRR',
            'status' => 'publish',
            'stock' => 10,
            'stock_status' => 'instock',
            'manage_stock' => true,
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ]);
    }

    public function test_pending_review_creates_admin_in_app_notification(): void
    {
        ShopSettings::saveReviews($this->tenant->id, [
            'enabled' => true,
            'require_approval' => true,
            'show_average' => true,
        ]);
        $this->product();

        $this->postJson('/api/v1/public/catalog/items/espresso/reviews', [
            'rating' => 4,
            'body' => 'Nice',
            'author_name' => 'Sara',
        ], ['X-Tenant-Domain' => 'notify.test'])->assertCreated();

        $row = UserNotification::query()
            ->where('user_id', $this->admin->id)
            ->where('type', 'review_pending')
            ->first();
        $this->assertNotNull($row);
        $this->assertStringContainsString('Espresso', (string) $row->body);
        $this->assertSame('/dashboard/settings/shop/reviews', $row->link);
    }

    public function test_dispatch_respects_disabled_admin_audience(): void
    {
        $settings = NotificationSettings::defaults();
        $settings['channels']['site']['events']['review_pending']['admin'] = false;
        NotificationSettings::save($this->tenant->id, $settings);

        $sent = app(NotificationDispatcher::class)->dispatch('review_pending', $this->tenant->id, [
            'vars' => ['product_name' => 'X', 'customer_name' => 'Y'],
        ]);

        $this->assertSame([], $sent);
        $this->assertSame(0, UserNotification::query()->where('user_id', $this->admin->id)->count());
    }

    public function test_order_status_change_still_notifies_customer(): void
    {
        $customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $customer->id,
            'number' => 'WD-100',
            'status' => 'pending_payment',
            'subtotal_minor' => 1000,
            'total_minor' => 1000,
            'currency' => 'IRR',
            'customer_name' => 'Ali',
            'customer_email' => 'ali@example.com',
        ]);

        $order->update(['status' => 'processing']);

        $row = UserNotification::query()
            ->where('user_id', $customer->id)
            ->where('type', 'order_status')
            ->first();
        $this->assertNotNull($row);
        $this->assertSame('/dashboard/account/orders/'.$order->id, $row->link);
        $this->assertStringContainsString('WD-100', (string) $row->title);
    }

    public function test_stock_drop_below_threshold_notifies_admin(): void
    {
        $product = $this->product();

        $product->update(['stock' => 1]);

        $this->assertTrue(UserNotification::query()
            ->where('user_id', $this->admin->id)
            ->where('type', 'stock_low')
            ->exists());
    }
}
