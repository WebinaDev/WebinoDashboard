<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\StripeDriver;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StripeVerificationIntegrityTest extends TestCase
{
    public function test_zero_decimal_currency_uses_whole_units(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['id' => 'cs_test_001', 'url' => 'https://example.local/pay'])]);
        $driver = new StripeDriver;
        $result = $driver->request(['secret_key' => 'test', 'currency' => 'JPY', 'rial_per_unit' => '500000'], 1000000, 'https://example.local/callback', 'test');

        $this->assertTrue($result['ok']);
        $this->assertSame(2, $result['meta']['fx_amount']);
        Http::assertSent(fn (Request $request) => $request['line_items[0][price_data][unit_amount]'] === 2);
    }

    public function test_verification_requires_matching_session_amount_and_currency(): void
    {
        $driver = new StripeDriver;
        $intent = ['stripe_session_id' => 'cs_test_001', 'amount_rial' => 1000000, 'fx_amount' => 200, 'fx_currency' => 'USD'];
        $config = ['secret_key' => 'test_secret'];

        $response = ['id' => 'cs_test_001', 'payment_status' => 'paid', 'amount_total' => 200, 'currency' => 'usd', 'payment_intent' => 'pi_test_001'];
        $providerResponse = $response;
        Http::fake(function () use (&$providerResponse) {
            return Http::response($providerResponse);
        });
        $this->assertFalse($driver->verify($config, 1000000, ['session_id' => 'cs_test_other'], $intent)['ok']);
        $this->assertFalse($driver->verify($config, 999999, [], $intent)['ok']);
        $this->assertFalse($driver->verify($config, 1000000, [], [])['ok']);
        Http::assertNothingSent();

        foreach ([
            ['id' => 'cs_test_other'],
            ['amount_total' => 199],
            ['currency' => 'eur'],
            ['payment_status' => 'unpaid'],
        ] as $change) {
            $providerResponse = array_replace($response, $change);
            $this->assertFalse($driver->verify($config, 1000000, ['session_id' => 'cs_test_001'], $intent)['ok']);
        }

        $providerResponse = $response;
        $this->assertTrue($driver->verify($config, 1000000, ['session_id' => 'cs_test_001'], $intent)['ok']);
    }
}
