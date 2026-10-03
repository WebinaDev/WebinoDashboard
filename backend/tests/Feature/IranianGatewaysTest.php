<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Product;
use App\Models\Tenant;
use App\Models\TenantBillingPayment;
use App\Models\User;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IranianGatewaysTest extends TestCase
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
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_gateways_page_settings_round_trip_and_checkout_hides_disabled(): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $this->postJson('/api/v1/payments/gateways/zarinpal', [
            'enabled' => true,
            'settings' => [
                'merchant_id' => 'merchant-1',
                'sandbox' => true,
                'fee_percent' => 10,
                'fee_payer' => 'customer',
                'cash_enabled' => true,
                'installment_enabled' => false,
            ],
        ])->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.settings.fee_percent', 10)
            ->assertJsonPath('data.settings.cash_enabled', true)
            ->assertJsonPath('data.settings.has_access_token', false);

        $this->postJson('/api/v1/payments/gateways/snapppay', [
            'enabled' => true,
            'settings' => [
                'client_id' => 'cid',
                'client_secret' => 'sec',
                'client_username' => 'user',
                'client_password' => 'pass',
                'sandbox' => true,
                'cash_enabled' => false,
                'installment_enabled' => true,
                'fee_percent' => 2.5,
            ],
        ])->assertOk();

        $this->postJson('/api/v1/payments/gateways/digipay', [
            'enabled' => false,
            'settings' => [
                'client_id' => 'd',
                'client_secret' => 'd',
                'username' => 'd',
                'password' => 'd',
                'environment' => 'live',
                'cash_enabled' => true,
                'installment_enabled' => true,
            ],
        ])->assertOk()->assertJsonPath('data.enabled', false);

        $cash = collect($this->getJson('/api/v1/payments/checkout-options?mode=cash')->assertOk()->json('data.gateways'));
        $this->assertSame(['zarinpal'], $cash->pluck('id')->all());

        $installment = collect($this->getJson('/api/v1/payments/checkout-options?mode=installment')->assertOk()->json('data.gateways'));
        $this->assertSame(['snapppay'], $installment->pluck('id')->all());
        $this->assertFalse($gateways->isEnabled($this->tenant->id, 'digipay'));
    }

    public function test_zarinpal_callback_binds_authority_and_ignores_empty_gets(): void
    {
        $gateways = app(PaymentGatewaySettingsService::class);
        $gateways->setGatewayEnabled($this->tenant->id, 'zarinpal', true);
        $gateways->save($this->tenant->id, 'zarinpal', [
            'merchant_id' => 'merchant-1',
            'sandbox' => true,
            'fee_percent' => 10,
            'fee_payer' => 'customer',
            'cash_enabled' => true,
            'installment_enabled' => false,
        ]);

        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'P',
            'slug' => 'p',
            'price_minor' => 10000,
            'currency' => 'IRT',
            'status' => 'publish',
            'manage_stock' => true,
            'stock' => 3,
        ]);
        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'status' => 'pending_payment',
            'subtotal_minor' => 10000,
            'total_minor' => 10000,
            'currency' => 'IRT',
        ]);
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => 'P',
            'quantity' => 1,
            'unit_price_minor' => 10000,
        ]);

        Http::fake([
            'sandbox.zarinpal.com/pg/v4/payment/request.json' => Http::response(['data' => ['code' => 100, 'authority' => 'AUTH-OWN']]),
            'sandbox.zarinpal.com/pg/v4/payment/verify.json' => Http::response(['data' => ['code' => 100, 'ref_id' => 99]]),
        ]);

        $this->postJson('/api/v1/payments/intent', [
            'order_id' => $order->id,
            'provider' => 'zarinpal',
            'mode' => 'cash',
        ])->assertOk()->assertJsonPath('data.charge_minor', 11000);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'payment/request.json')
                && (int) $request['amount'] === 11000;
        });

        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id)->assertRedirect();
        $this->assertSame('awaiting_gateway', $order->fresh()->status);
        $this->assertSame(3, $product->fresh()->stock);

        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=OTHER&Status=OK')->assertRedirect();
        $this->assertSame('awaiting_gateway', $order->fresh()->status);

        $intent = PaymentIntent::query()->where('order_id', $order->id)->firstOrFail();
        $nonce = (string) data_get($intent->meta, 'state');
        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=AUTH-OWN&Status=NOK&nonce='.$nonce)
            ->assertRedirect();
        $this->assertSame('payment_failed', $order->fresh()->status);
        $this->assertSame(3, $product->fresh()->stock);

        $order->update(['status' => 'awaiting_gateway']);
        $intent->update(['status' => 'created']);
        $this->get('/api/v1/payments/callback/zarinpal/'.$order->id.'?Authority=AUTH-OWN&Status=OK&nonce='.$nonce)
            ->assertRedirect();
        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(99, (int) $order->fresh()->payment_ref);
        $this->assertSame(2, $product->fresh()->stock);
    }

    public function test_billing_uses_only_gateways_erp_marks_enabled(): void
    {
        config([
            'services.webino.base_url' => 'https://erp.test',
            'services.webino.erp_api_token' => 'tok',
            'services.webino.billing_mode' => 'live',
            'app.frontend_url' => 'https://dash.test',
        ]);

        Http::fake([
            'erp.test/api/v1/tenant/billing/outstanding*' => Http::response([
                'data' => [
                    'bills' => [
                        ['id' => 'sms-1', 'kind' => 'sms', 'title' => 'بسته پیامک', 'amount_minor' => 100000, 'currency' => 'IRT', 'status' => 'open'],
                    ],
                    'gateways' => [
                        ['id' => 'zarinpal', 'label' => 'زرین‌پال', 'enabled' => true, 'modes' => ['cash'], 'fee_percent' => 1],
                        ['id' => 'snapppay', 'label' => 'اسنپ‌پی', 'enabled' => false, 'modes' => ['installment'], 'fee_percent' => 2],
                    ],
                ],
            ]),
            'erp.test/api/v1/tenant/billing/payments' => Http::response([
                'data' => [
                    'payment_id' => 'pay_1',
                    'redirect_url' => 'https://sandbox.zarinpal.com/pg/StartPay/AUTH',
                    'status' => 'pending',
                ],
            ], 201),
            'erp.test/api/v1/tenant/billing/payments/pay_1' => Http::response([
                'data' => ['payment_id' => 'pay_1', 'status' => 'pending'],
            ]),
        ]);

        $listed = $this->getJson('/api/v1/billing/outstanding')->assertOk()->json('data');
        $this->assertSame('erp', $listed['source']);
        $this->assertSame(['zarinpal'], collect($listed['gateways'])->pluck('id')->all());

        $this->postJson('/api/v1/billing/payments', [
            'bill_id' => 'sms-1',
            'mode' => 'installment',
            'gateway' => 'snapppay',
        ])->assertStatus(422);

        $created = $this->postJson('/api/v1/billing/payments', [
            'bill_id' => 'sms-1',
            'mode' => 'cash',
            'gateway' => 'zarinpal',
        ])->assertCreated()->json('data.payment');

        $this->assertSame('pending', $created['status']);
        $this->assertSame(1000, $created['fee_minor']);
        $this->assertSame(101000, $created['total_minor']);
        $this->assertStringStartsWith('https://sandbox.zarinpal.com/', $created['redirect_url']);

        Http::assertSent(function ($request) use ($created) {
            if (! str_contains($request->url(), '/billing/payments') || $request->method() !== 'POST') {
                return false;
            }

            return $request->hasHeader('Authorization', 'Bearer tok')
                && $request->hasHeader('X-Tenant-Domain', 'shop.test')
                && $request->hasHeader('X-Site-Token', 'site-token')
                && str_contains((string) $request['return_url'], '/dashboard/platform-billing/return?payment='.$created['id']);
        });

        $this->getJson('/api/v1/billing/payments/'.$created['id'].'?status=OK&Authority=AUTH')
            ->assertOk()
            ->assertJsonPath('data.payment.status', 'pending');
        $this->assertSame('pending', TenantBillingPayment::query()->find($created['id'])->status);
    }

    public function test_billing_stub_when_erp_token_missing(): void
    {
        config([
            'services.webino.base_url' => '',
            'services.webino.erp_api_token' => '',
            'services.webino.billing_mode' => 'auto',
            'services.webino.billing_stub_autopay' => false,
            'app.frontend_url' => 'https://dash.test',
        ]);

        $ids = collect($this->getJson('/api/v1/billing/outstanding')->assertOk()->json('data.gateways'))->pluck('id')->all();
        $this->assertNotContains('snapppay', $ids);
        $this->assertContains('zarinpal', $ids);
        $this->assertContains('torobpay', $ids);

        $payment = $this->postJson('/api/v1/billing/payments', [
            'bill_id' => 'inv-1042',
            'mode' => 'cash',
            'gateway' => 'zarinpal',
        ])->assertCreated()->json('data.payment');

        $this->assertSame('pending', $payment['status']);
        $this->assertStringContainsString('payment='.$payment['id'], $payment['redirect_url']);
        $this->getJson('/api/v1/billing/payments/'.$payment['id'].'?Status=OK')
            ->assertOk()
            ->assertJsonPath('data.payment.status', 'pending');
    }
}
