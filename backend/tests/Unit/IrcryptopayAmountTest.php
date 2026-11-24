<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\IrcryptopayDriver;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IrcryptopayAmountTest extends TestCase
{
    public function test_request_uses_the_currency_unit_it_sends(): void
    {
        Http::fake(['api.ircryptopay.online/*' => Http::response(['id' => 'invoice_001', 'payment_url' => 'https://example.local/pay'])]);
        $driver = new IrcryptopayDriver;
        $config = ['api_key' => 'test', 'currency' => 'IRT'];

        $this->assertTrue($driver->request($config, 101, 'https://example.local/callback', 'test')['ok']);
        Http::assertSent(fn (Request $request) => $request['price_currency'] === 'IRR' && $request['amount'] === '101.00');

        $this->assertTrue($driver->request(['api_key' => 'test', 'currency' => 'USD', 'rial_per_unit' => '500000'], 1000000, 'https://example.local/callback', 'test')['ok']);
        Http::assertSent(fn (Request $request) => $request['price_currency'] === 'USD' && $request['amount'] === '2.00');
    }

    public function test_invalid_amount_and_missing_exchange_rate_do_not_reach_provider(): void
    {
        Http::fake();
        $driver = new IrcryptopayDriver;
        $this->assertFalse($driver->request(['api_key' => 'test', 'currency' => 'IRR'], 0, 'https://example.local/callback', 'test')['ok']);
        $this->assertFalse($driver->request(['api_key' => 'test', 'currency' => 'USD'], 1000000, 'https://example.local/callback', 'test')['ok']);
        Http::assertNothingSent();
    }

    public function test_callback_requires_the_invoice_and_amount_from_the_original_intent(): void
    {
        Http::fake();
        $driver = new IrcryptopayDriver;
        $intent = ['ircryptopay_id' => 'invoice_001', 'amount_rial' => 1000];

        $this->assertFalse($driver->verify(['api_key' => 'test'], 1000, ['id' => 'invoice_other'], $intent)['ok']);
        $this->assertFalse($driver->verify(['api_key' => 'test'], 1001, [], $intent)['ok']);
        $this->assertFalse($driver->verify(['api_key' => 'test'], 1000, ['id' => 'invoice_001'], [])['ok']);
        Http::assertNothingSent();
    }
}
