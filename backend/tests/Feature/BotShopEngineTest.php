<?php

namespace Tests\Feature;

use App\Models\BotOutboundMessage;
use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\C2cSetting;
use App\Models\Order;
use App\Models\Product;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Bots\Engine\BotMessenger;
use App\Services\Payments\PaymentGatewaySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BotShopEngineTest extends TestCase
{
    use RefreshDatabase;

    private BotSetting $setting;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = Tenant::query()->create([
            'name' => 'BotShop', 'slug' => 'bot-shop', 'domain' => 'bot.test', 'license_key' => 'lic-bot',
            'setup_completed' => true, 'store_display_name' => 'فروشگاه تست', 'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($tenant->id, [
            'bots.bale' => true, 'bots.telegram' => true, 'commerce.checkout' => true, 'commerce.cart' => true, 'commerce.catalog' => true,
        ]);
        User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->product = Product::query()->create([
            'tenant_id' => $tenant->id, 'name' => 'قهوه اسپرسو', 'slug' => 'espresso', 'sku' => 'esp',
            'price_minor' => 150000, 'currency' => 'IRT', 'stock' => 10, 'status' => 'publish', 'is_available' => true,
        ]);
        $this->setting = BotSetting::query()->create([
            'tenant_id' => $tenant->id, 'provider' => 'bale', 'enabled' => true, 'token' => 'tok', 'webhook_secret' => 'sec',
            'meta' => [
                'addons' => ['faq' => true, 'tickets' => true, 'card_to_card' => true, 'order_cascade' => true, 'loyalty' => true],
                'admin_chat_ids' => '777',
                'faq' => [['q' => 'ساعت کاری', 'a' => 'هر روز ۹ تا ۲۱', 'keywords' => 'ساعت,باز']],
            ],
        ]);
        Http::fake(['tapi.bale.ai/*' => Http::response(['ok' => true, 'result' => ['message_id' => 1]], 200)]);
    }

    private function msg(array $message, string $chat = '555'): void
    {
        $message['chat'] = ['id' => $chat];
        $message['from'] = $message['from'] ?? ['id' => (int) $chat, 'first_name' => 'علی'];
        $this->postJson('/api/v1/public/bots/bale/webhook', ['message' => $message], ['X-Bot-Secret' => 'sec'])->assertOk();
    }

    private function cb(string $data, string $chat = '555'): void
    {
        $this->postJson('/api/v1/public/bots/bale/webhook', ['callback_query' => [
            'id' => 'q1', 'data' => $data, 'from' => ['id' => (int) $chat], 'message' => ['chat' => ['id' => $chat]],
        ]], ['X-Bot-Secret' => 'sec'])->assertOk();
    }

    private function sentTexts(): array
    {
        return collect(Http::recorded())->map(fn ($pair) => (string) ($pair[0]->data()['text'] ?? $pair[0]->data()['caption'] ?? ''))->filter()->values()->all();
    }

    public function test_start_replies_with_main_menu(): void
    {
        $this->msg(['text' => '/start']);
        Http::assertSent(function (HttpRequest $r) {
            return str_contains($r->url(), '/sendMessage')
                && str_contains((string) ($r->data()['text'] ?? ''), 'فروشگاه تست')
                && isset($r->data()['reply_markup']['keyboard']);
        });
    }

    public function test_full_checkout_with_card_to_card_and_admin_approval(): void
    {
        app(PaymentGatewaySettingsService::class)->setGatewayEnabled($this->setting->tenant_id, 'c2c', true);
        C2cSetting::query()->create(['tenant_id' => $this->setting->tenant_id, 'payload' => ['cards' => [['number' => '6037-0000-0000-0000', 'holder' => 'فروشگاه']], 'deadline_hours' => 2]]);

        $this->cb('p:'.$this->product->id);
        $this->cb('a:'.$this->product->id);
        $this->cb('ci:'.$this->product->id);
        $this->cb('co');
        $this->assertSame('checkout_contact', BotSession::query()->where('chat_id', '555')->first()->meta['state']);

        // Someone else's contact is refused.
        $this->msg(['contact' => ['phone_number' => '989120000000', 'user_id' => 999]]);
        $this->assertNull(BotSession::query()->where('chat_id', '555')->first()->user_id);

        $this->msg(['contact' => ['phone_number' => '+989121112233', 'user_id' => 555, 'first_name' => 'علی']]);
        $session = BotSession::query()->where('chat_id', '555')->first();
        $this->assertNotNull($session->user_id);
        $this->assertSame('09121112233', User::query()->find($session->user_id)->phone);

        $this->msg(['text' => 'علی رضایی']);
        $this->cb('st:IR:TE');
        $this->msg(['text' => 'تهران']);
        $this->msg(['text' => 'خیابان آزادی، کوچه ۱۲، پلاک ۴']);
        $this->msg(['text' => 'ندارد']);
        $this->assertSame('checkout_confirm', BotSession::query()->find($session->id)->meta['state']);
        $this->cb('cf');

        $order = Order::query()->where('user_id', $session->user_id)->firstOrFail();
        $this->assertSame('bale', $order->sales_channel);
        $this->assertSame(300000, (int) $order->subtotal_minor);
        $this->assertSame('555', $order->meta['bot']['chat_id']);
        $this->assertStringContainsString('تهران', (string) $order->shipping_address);

        $this->cb('pay:'.$order->id.':c2c');
        $this->assertSame('card_to_card', $order->fresh()->payment_tender);
        $this->msg(['text' => 'پیگیری 123456']);
        $this->assertSame('123456', substr((string) $order->fresh()->meta['c2c_bot_receipt']['ref'], -6));
        Http::assertSent(fn (HttpRequest $r) => ($r->data()['chat_id'] ?? null) === '777' && str_contains((string) ($r->data()['text'] ?? ''), 'کارت‌به‌کارت'));

        // Non-admin cannot approve.
        $this->cb('ca:'.$order->id, '555');
        $this->assertSame('pending', $order->fresh()->c2c_status);

        $this->cb('ca:'.$order->id, '777');
        $this->assertSame('approved', $order->fresh()->c2c_status);
        $this->assertSame('paid', $order->fresh()->status);
        Http::assertSent(fn (HttpRequest $r) => ($r->data()['chat_id'] ?? null) === '555' && str_contains((string) ($r->data()['text'] ?? ''), 'تأیید شد'));
    }

    public function test_faq_and_ticket_round_trip(): void
    {
        $this->msg(['text' => 'ساعت کاری شما چیه؟']);
        $this->assertTrue(collect($this->sentTexts())->contains(fn ($t) => str_contains($t, '۹ تا ۲۱')));

        $this->msg(['contact' => ['phone_number' => '09125556677', 'user_id' => 555]]);
        $this->cb('tn');
        $this->msg(['text' => "مشکل ارسال\nسفارشم نرسیده است"]);
        $ticket = SupportTicket::query()->firstOrFail();
        $this->assertSame('مشکل ارسال', $ticket->subject);

        // Admin replies from the bot; customer gets it.
        $this->cb('tr:'.$ticket->id, '777');
        $this->msg(['text' => 'فردا ارسال می‌شود'], '777');
        $this->assertSame('answered', $ticket->fresh()->status);
        Http::assertSent(fn (HttpRequest $r) => ($r->data()['chat_id'] ?? null) === '555' && str_contains((string) ($r->data()['text'] ?? ''), 'فردا ارسال'));
    }

    public function test_failed_send_is_queued_and_retried(): void
    {
        BotSetting::query()->create(['tenant_id' => $this->setting->tenant_id, 'provider' => 'telegram', 'enabled' => true, 'token' => 't2', 'webhook_secret' => 's2']);
        Http::fake(['api.telegram.org/*' => Http::sequence()->push(['ok' => false], 502)->push(['ok' => true], 200)]);
        BotMessenger::call($this->setting->tenant_id, 'telegram', null, 'sendMessage', ['chat_id' => '1', 'text' => 'hi']);
        $row = BotOutboundMessage::query()->firstOrFail();
        $this->assertSame('pending', $row->status);
        $row->update(['next_attempt_at' => now()->subMinute()]);
        $this->assertSame(1, BotMessenger::retryDue());
        $this->assertSame('sent', $row->fresh()->status);
    }

    public function test_search_and_category_listing(): void
    {
        $this->msg(['text' => '🔎 جستجو']);
        $this->msg(['text' => 'اسپرسو']);
        Http::assertSent(fn (HttpRequest $r) => str_contains(json_encode($r->data()['reply_markup'] ?? [], JSON_UNESCAPED_UNICODE), 'p:'.$this->product->id));
    }
}
