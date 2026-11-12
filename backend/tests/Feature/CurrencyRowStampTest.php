<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Support\Currency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CurrencyRowStampTest extends TestCase
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
            'commerce.cart' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_irt_row_on_irt_store_multiplies_for_zibal_only(): void
    {
        [$order] = $this->orderWithProducts([
            ['name' => 'Ali frame', 'price' => 10000, 'currency' => 'IRT'],
        ]);
        $this->assertSame('IRT', $order->currency);
        $this->assertSame(10000, (int) $order->total_minor);
        $this->assertGateway($order, 'zibal', 100000);
        $this->assertGateway($order, 'zarinpal', 10000, 'IRT');
    }

    public function test_irr_row_on_irt_store_displays_and_charges_correctly(): void
    {
        // bluecafe espresso: 850,000 IRR should snapshot as 85,000 toman.
        [$order, $product] = $this->orderWithProducts([
            ['name' => 'Espresso', 'price' => 850000, 'currency' => 'IRR'],
        ]);
        $this->assertSame('IRT', $order->currency);
        $this->assertSame(85000, (int) $order->total_minor);
        $this->assertSame(85000, (int) $order->items->first()->unit_price_minor);
        $this->assertSame(85000, Currency::convert((int) $product->price_minor, $product->currency, 'IRT'));
        $this->assertGateway($order, 'zibal', 850000);
        $this->assertGateway($order, 'zarinpal', 85000, 'IRT');
    }

    public function test_mixed_irr_and_irt_cart_snapshots_in_store_currency(): void
    {
        [$order] = $this->orderWithProducts([
            ['name' => 'Espresso', 'price' => 850000, 'currency' => 'IRR'],
            ['name' => 'Sticker', 'price' => 10000, 'currency' => 'IRT'],
        ]);
        $this->assertSame('IRT', $order->currency);
        $this->assertSame(95000, (int) $order->total_minor);
        $this->assertGateway($order, 'zibal', 950000);
        $this->assertGateway($order, 'zarinpal', 95000, 'IRT');
    }

    public function test_existing_irr_order_is_charged_as_rial_not_reinterpreted(): void
    {
        // A pre-existing bluecafe pending order already snapshotted in IRR rials.
        $product = $this->makeProduct('Latte', 1700000, 'IRR');
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => 'pending_payment',
            'subtotal_minor' => 1700000,
            'total_minor' => 1700000,
            'currency' => 'IRR',
        ]);
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => 'Latte',
            'quantity' => 1,
            'unit_price_minor' => 1700000,
        ]);
        $this->assertGateway($order, 'zibal', 1700000);
        $this->assertGateway($order, 'zarinpal', 170000, 'IRT');
    }

    /**
     * @param  list<array{name:string,price:int,currency:string}>  $rows
     * @return array{0: Order, 1: Product}
     */
    protected function orderWithProducts(array $rows): array
    {
        $this->actingAs($this->user, 'sanctum');
        $first = null;
        foreach ($rows as $row) {
            $product = $this->makeProduct($row['name'], $row['price'], $row['currency']);
            $first ??= $product;
            $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertOk();
        }
        $data = $this->postJson('/api/v1/checkout', [
            'customer_phone' => '09120000000',
        ])->assertCreated()->json('data');

        return [Order::query()->with('items')->findOrFail($data['id']), $first];
    }

    protected function makeProduct(string $name, int $price, string $currency): Product
    {
        return Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => strtolower(preg_replace('/\s+/', '-', $name)).'-'.uniqid(),
            'price_minor' => $price,
            'currency' => $currency,
            'status' => 'publish',
            'is_available' => true,
            'is_hidden' => false,
            'is_sold_out' => false,
            'manage_stock' => false,
            'stock_status' => 'instock',
            'meta' => ['virtual' => true],
        ]);
    }

    protected function assertGateway(Order $order, string $provider, int $expectedAmount, ?string $expectedCurrency = null): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, $provider, true);
        $settings = $provider === 'zarinpal'
            ? ['merchant_id' => 'merchant-1', 'sandbox' => true, 'cash_enabled' => true, 'fee_percent' => 0, 'fee_payer' => 'merchant']
            : ['merchant_id' => 'zibal-merchant', 'sandbox' => false, 'cash_enabled' => true, 'fee_percent' => 0, 'fee_payer' => 'merchant'];
        $gateways->save($this->tenant->id, $provider, $settings);

        Http::fake([
            'gateway.zibal.ir/v1/request' => Http::response(['result' => 100, 'trackId' => 'ZB-1']),
            'sandbox.zarinpal.com/pg/v4/payment/request.json' => Http::response(['data' => ['code' => 100, 'authority' => 'AUTH-1']]),
        ]);

        $order->update(['status' => 'pending_payment']);
        $this->postJson('/api/v1/payments/intent', [
            'order_id' => $order->id,
            'provider' => $provider,
            'mode' => 'cash',
        ])->assertOk();

        Http::assertSent(function ($request) use ($provider, $expectedAmount, $expectedCurrency) {
            if ($provider === 'zibal') {
                return str_contains($request->url(), 'gateway.zibal.ir/v1/request')
                    && (int) $request['amount'] === $expectedAmount;
            }

            return str_contains($request->url(), 'payment/request.json')
                && (int) $request['amount'] === $expectedAmount
                && ($expectedCurrency === null || ($request['currency'] ?? null) === $expectedCurrency);
        });
    }
}
