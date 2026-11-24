<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\PaypalDriver;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaypalVerificationIntegrityTest extends TestCase
{
    public function test_zero_decimal_currency_uses_whole_units(): void
    {
        Http::fake([
            '*/v1/oauth2/token' => Http::response(['access_token' => 'test']),
            '*/v2/checkout/orders' => Http::response(['id' => 'order_001', 'links' => [['rel' => 'approve', 'href' => 'https://example.local/pay']]]),
        ]);
        $driver = new PaypalDriver;
        $result = $driver->request(['client_id' => 'test', 'client_secret' => 'test', 'sandbox' => true, 'currency' => 'JPY', 'rial_per_unit' => '500000'], 1000000, 'https://example.local/callback', 'test');

        $this->assertTrue($result['ok']);
        $this->assertSame(2, $result['meta']['fx_amount']);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/v2/checkout/orders')
            && data_get($request->data(), 'purchase_units.0.amount.value') === '2'
            && data_get($request->data(), 'purchase_units.0.amount.currency_code') === 'JPY');
    }

    public function test_capture_requires_matching_order_amount_currency_and_completed_status(): void
    {
        $driver = new PaypalDriver;
        $intent = ['paypal_order_id' => 'order_001', 'amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];
        $config = ['client_id' => 'test', 'client_secret' => 'test', 'sandbox' => true];
        $response = ['id' => 'order_001', 'status' => 'COMPLETED', 'purchase_units' => [[
            'payments' => ['captures' => [['id' => 'capture_001', 'status' => 'COMPLETED', 'amount' => ['value' => '1.00', 'currency_code' => 'USD']]]],
        ]]];
        $providerResponse = $response;
        Http::fake(function (Request $request) use (&$providerResponse) {
            return str_ends_with($request->url(), '/v1/oauth2/token')
                ? Http::response(['access_token' => 'test'])
                : Http::response($providerResponse);
        });

        $this->assertFalse($driver->verify($config, 500000, ['token' => 'order_other'], $intent)['ok']);
        $this->assertFalse($driver->verify($config, 500001, [], $intent)['ok']);
        $this->assertFalse($driver->verify($config, 500000, [], [])['ok']);
        Http::assertNothingSent();

        foreach ([
            ['id' => 'order_other'],
            ['status' => 'APPROVED'],
            ['purchase_units' => [['payments' => ['captures' => [['status' => 'COMPLETED', 'amount' => ['value' => '0.99', 'currency_code' => 'USD']]]]]]],
            ['purchase_units' => [['payments' => ['captures' => [['status' => 'COMPLETED', 'amount' => ['value' => '1.00', 'currency_code' => 'EUR']]]]]]],
        ] as $change) {
            $providerResponse = array_replace($response, $change);
            $this->assertFalse($driver->verify($config, 500000, ['token' => 'order_001'], $intent)['ok']);
        }
        $providerResponse = $response;
        $this->assertTrue($driver->verify($config, 500000, ['token' => 'order_001'], $intent)['ok']);
    }
}
