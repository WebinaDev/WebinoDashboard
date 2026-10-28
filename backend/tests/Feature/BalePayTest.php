<?php

namespace Tests\Feature;

use App\Models\BotSetting;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Tenant;
use App\Services\Payments\BalePayService;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BalePayTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = Tenant::query()->create([
            'name' => 'BP', 'slug' => 'bp', 'domain' => 'bp.test', 'license_key' => 'lic-bp',
            'setup_completed' => true, 'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($tenant->id, ['bots.bale' => true, 'commerce.checkout' => true]);
        BotSetting::query()->create([
            'tenant_id' => $tenant->id, 'provider' => 'bale', 'enabled' => true, 'token' => 'tok', 'webhook_secret' => 'sec',
        ]);
        app(PaymentGatewaySettingsService::class)->save($tenant->id, 'bale_pay', ['provider_token' => 'WALLET-1']);
        $this->order = Order::query()->create([
            'tenant_id' => $tenant->id, 'status' => 'awaiting_gateway', 'total_minor' => 5000,
            'currency' => 'IRT', 'number' => 'BP-1', 'payment_provider' => 'bale_pay',
        ]);
        PaymentIntent::query()->create([
            'tenant_id' => $tenant->id, 'order_id' => $this->order->id, 'provider' => 'bale_pay',
            'status' => 'pending', 'meta' => ['amount_rial' => 50000],
        ]);
        Http::fake([
            'tapi.bale.ai/*/createInvoiceLink' => Http::response(['ok' => true, 'result' => 'https://ble.ir/invoice/abc'], 200),
            'tapi.bale.ai/*' => Http::response(['ok' => true, 'result' => []], 200),
        ]);
    }

    private function hook(array $update): void
    {
        $this->postJson('/api/v1/public/bots/bale/webhook', $update, ['X-Bot-Secret' => 'sec'])->assertOk();
    }

    private function pay(string $chat, int $amount): void
    {
        $this->hook(['message' => ['chat' => ['id' => $chat], 'from' => ['id' => (int) $chat], 'successful_payment' => [
            'invoice_payload' => BalePayService::sign($this->order->id), 'total_amount' => $amount,
            'currency' => 'IRR', 'telegram_payment_charge_id' => 'CH-9',
        ]]]);
    }

    public function test_start_sends_invoice_and_payment_marks_paid(): void
    {
        $this->hook(['message' => ['chat' => ['id' => '555'], 'from' => ['id' => 555], 'text' => '/start pay_'.$this->order->id]]);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/sendInvoice')
            && $r['provider_token'] === 'WALLET-1' && $r['prices'][0]['amount'] === 50000);

        $this->hook(['pre_checkout_query' => ['id' => 'pq', 'from' => ['id' => 555], 'invoice_payload' => BalePayService::sign($this->order->id), 'total_amount' => 50000]]);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/answerPreCheckoutQuery') && $r['ok'] === true);

        $this->pay('555', 50000);
        $this->assertSame('paid', $this->order->fresh()->status);
        $this->assertSame('CH-9', $this->order->fresh()->payment_ref);
    }

    public function test_wrong_amount_chat_or_payload_never_marks_paid(): void
    {
        $this->hook(['message' => ['chat' => ['id' => '555'], 'from' => ['id' => 555], 'text' => '/start pay_'.$this->order->id]]);
        $this->hook(['pre_checkout_query' => ['id' => 'pq', 'from' => ['id' => 555], 'invoice_payload' => BalePayService::sign($this->order->id), 'total_amount' => 10]]);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/answerPreCheckoutQuery') && $r['ok'] === false);
        $this->hook(['pre_checkout_query' => ['id' => 'pq', 'from' => ['id' => 555], 'invoice_payload' => $this->order->id.':0000000000000000', 'total_amount' => 50000]]);

        $this->pay('555', 10);
        $this->pay('999', 50000);
        $this->assertSame('awaiting_gateway', $this->order->fresh()->status);

        $this->get('/api/v1/payments/callback/bale_pay/'.$this->order->id);
        $this->assertSame('awaiting_gateway', $this->order->fresh()->status);
    }

    public function test_miniapp_invoice_link_binds_payer_at_pre_checkout(): void
    {
        $intent = PaymentIntent::query()->where('order_id', $this->order->id)->firstOrFail();
        $link = app(BalePayService::class)->invoiceLink($this->order, $intent);
        $this->assertSame('https://ble.ir/invoice/abc', $link);
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), 'createInvoiceLink')
            && $r['currency'] === 'IRR' && $r['provider_token'] === 'WALLET-1' && $r['prices'][0]['amount'] === 50000);

        $this->hook(['pre_checkout_query' => ['id' => 'q1', 'from' => ['id' => 777],
            'invoice_payload' => BalePayService::sign($this->order->id), 'total_amount' => 50000, 'currency' => 'IRR']]);
        $this->assertSame('777', (string) $intent->fresh()->meta['chat_id']);

        $this->pay('888', 50000);
        $this->assertNotSame('paid', $this->order->fresh()->status);
        $this->pay('777', 50000);
        $this->assertSame('paid', $this->order->fresh()->status);
    }
}
