<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductStockAlert;
use App\Models\Tenant;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Notifications\NotificationSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductPriceDropAlertTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    /** @var list<array{0: string, 1: array}> */
    protected array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant();
        $this->enableSubmodules($this->tenant->id, ['commerce.catalog' => true]);
        $test = $this;
        $this->app->instance(NotificationDispatcher::class, new class($test) extends NotificationDispatcher
        {
            public function __construct(private $test) {}

            public function dispatch(string $event, int $tenantId, array $context = []): array
            {
                $this->test->record($event, $context);

                return [];
            }
        });
    }

    public function record(string $event, array $context): void
    {
        $this->sent[] = [$event, $context];
    }

    private function product(): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Lipstick', 'slug' => 'lipstick-'.uniqid(),
            'price_minor' => 100000, 'currency' => 'IRR', 'status' => 'publish', 'stock' => 5,
            'stock_status' => 'instock', 'is_available' => true, 'is_hidden' => false, 'type' => 'simple',
        ]);
    }

    private function alert(Product $p, string $type = ProductStockAlert::TYPE_PRICE_DROP): ProductStockAlert
    {
        return ProductStockAlert::query()->create([
            'tenant_id' => $this->tenant->id, 'product_id' => $p->id, 'channel' => 'sms',
            'destination' => '09120000000', 'alert_type' => $type,
        ]);
    }

    public function test_price_decrease_sends_price_drop_sms_once(): void
    {
        $p = $this->product();
        $alert = $this->alert($p);
        $p->update(['price_minor' => 80000]);

        $drops = array_values(array_filter($this->sent, fn ($s) => $s[0] === 'product_price_drop'));
        $this->assertCount(1, $drops);
        $this->assertSame(['sms'], $drops[0][1]['only']);
        $this->assertSame('09120000000', $drops[0][1]['customer_phone']);
        $this->assertSame('80,000', $drops[0][1]['vars']['price']);
        $this->assertNotNull($alert->fresh()->notified_at);

        $p->update(['price_minor' => 70000]);
        $this->assertCount(1, array_filter($this->sent, fn ($s) => $s[0] === 'product_price_drop'));
    }

    public function test_price_increase_does_not_notify(): void
    {
        $p = $this->product();
        $alert = $this->alert($p);
        $p->update(['price_minor' => 120000]);
        $this->assertSame([], array_filter($this->sent, fn ($s) => $s[0] === 'product_price_drop'));
        $this->assertNull($alert->fresh()->notified_at);
    }

    public function test_alert_events_are_registered_and_on_for_customers(): void
    {
        $cfg = NotificationSettings::defaults();
        foreach (NotificationSettings::PRODUCT_ALERT_EVENTS as $event) {
            $this->assertContains($event, NotificationSettings::EVENTS);
            $this->assertTrue($cfg['channels']['sms']['events'][$event]['customer']);
            $this->assertFalse($cfg['channels']['sms']['events'][$event]['admin']);
        }
    }

    public function test_public_subscribe_accepts_price_drop(): void
    {
        $p = $this->product();
        $this->withHeaders(['Host' => (string) $this->tenant->domain])
            ->postJson('/api/v1/public/catalog/items/'.$p->slug.'/stock-alerts', [
                'alert_type' => 'price_drop', 'channel' => 'sms', 'destination' => '09121111111',
            ])->assertSuccessful();
        $this->assertDatabaseHas('product_stock_alerts', ['product_id' => $p->id, 'alert_type' => 'price_drop']);
    }
}
