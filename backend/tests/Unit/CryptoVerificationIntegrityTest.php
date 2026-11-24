<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\CoingateDriver;
use App\Services\Payments\Drivers\BinancePayDriver;
use App\Services\Payments\Drivers\CoinpaymentsDriver;
use App\Services\Payments\Drivers\CryptomusDriver;
use App\Services\Payments\Drivers\NowpaymentsDriver;
use App\Services\Payments\Drivers\PayeerDriver;
use App\Services\Payments\Drivers\PerfectMoneyDriver;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Request;
use Tests\TestCase;

class CryptoVerificationIntegrityTest extends TestCase
{
    public function test_coinpayments_signed_callback_rejects_a_different_amount(): void
    {
        Http::fake();
        $callback = ['txn_id' => 'transaction_001', 'status' => 100, 'amount1' => '0.99', 'currency1' => 'USD', 'merchant' => 'merchant_001'];
        $callback['_raw_body'] = http_build_query($callback);
        $callback['_hmac'] = hash_hmac('sha512', $callback['_raw_body'], 'test_secret');
        $intent = ['coinpayments_txn_id' => 'transaction_001', 'amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];

        $result = (new CoinpaymentsDriver)->verify(['ipn_secret' => 'test_secret', 'merchant_id' => 'merchant_001'], 500000, $callback, $intent);
        $this->assertFalse($result['ok']);
        Http::assertNothingSent();
    }

    public function test_signed_payment_payload_must_match_the_original_amount(): void
    {
        $intent = ['amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];
        $callback = ['m_operation_id' => 'op_001', 'm_operation_ps' => 'test', 'm_operation_date' => 'test', 'm_operation_pay_date' => 'test', 'm_shop' => 'shop_001', 'm_orderid' => 'order_001', 'm_amount' => '0.99', 'm_curr' => 'USD', 'm_desc' => 'test', 'm_status' => 'success'];
        $callback['m_sign'] = strtoupper(hash('sha256', implode(':', [$callback['m_operation_id'], $callback['m_operation_ps'], $callback['m_operation_date'], $callback['m_operation_pay_date'], $callback['m_shop'], $callback['m_orderid'], $callback['m_amount'], $callback['m_curr'], $callback['m_desc'], 'SUCCESS', 'test_secret'])));
        $this->assertFalse((new PayeerDriver)->verify(['merchant_id' => 'shop_001', 'secret_key' => 'test_secret'], 500000, $callback, $intent + ['payeer_order_id' => 'order_001'])['ok']);

        $payment = ['PAYMENT_ID' => 'order_001', 'PAYEE_ACCOUNT' => 'account_001', 'PAYMENT_AMOUNT' => '0.99', 'PAYMENT_UNITS' => 'USD', 'PAYMENT_BATCH_NUM' => 'batch_001', 'PAYER_ACCOUNT' => 'payer_001', 'TIMESTAMPGMT' => '1'];
        $payment['V2_HASH'] = strtoupper(md5(implode(':', [$payment['PAYMENT_ID'], $payment['PAYEE_ACCOUNT'], $payment['PAYMENT_AMOUNT'], $payment['PAYMENT_UNITS'], $payment['PAYMENT_BATCH_NUM'], $payment['PAYER_ACCOUNT'], strtoupper(md5('test_secret')), $payment['TIMESTAMPGMT']])));
        $this->assertFalse((new PerfectMoneyDriver)->verify(['payee_account' => 'account_001', 'passphrase' => 'test_secret'], 500000, $payment, $intent + ['perfect_money_payment_id' => 'order_001'])['ok']);
    }

    public function test_successful_binance_api_response_is_not_itself_a_paid_order(): void
    {
        Http::fake(['*' => Http::response(['status' => 'SUCCESS', 'data' => []])]);
        $intent = ['binance_merchant_trade_no' => 'order_001', 'amount_rial' => 500000];
        $result = (new BinancePayDriver)->verify(['api_key' => 'test', 'secret_key' => 'test'], 500000, [], $intent);
        $this->assertFalse($result['ok']);
    }

    public function test_binance_paid_status_requires_matching_amount_and_currency(): void
    {
        $providerResponse = ['status' => 'SUCCESS', 'data' => ['status' => 'PAID', 'orderAmount' => '0.99', 'currency' => 'USD']];
        Http::fake(function () use (&$providerResponse) {
            return Http::response($providerResponse);
        });
        $intent = ['binance_merchant_trade_no' => 'order_001', 'amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];
        $driver = new BinancePayDriver;
        $config = ['api_key' => 'test', 'secret_key' => 'test'];
        $this->assertFalse($driver->verify($config, 500000, [], $intent)['ok']);
        $providerResponse['data']['orderAmount'] = '1.00';
        $this->assertTrue($driver->verify($config, 500000, [], $intent)['ok']);
    }

    public function test_nowpayments_serializes_large_amounts_without_float_rounding(): void
    {
        Http::fake(['*' => Http::response(['id' => 'invoice_001', 'invoice_url' => 'https://example.local/pay'])]);
        $result = (new NowpaymentsDriver)->request(
            ['api_key' => 'test', 'currency' => 'USD', 'rial_per_unit' => '100'],
            9007199254740993,
            'https://example.local/callback',
            'test',
        );

        $this->assertTrue($result['ok']);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), '"price_amount":90071992547409.93,'));
    }

    public function test_callback_status_alone_cannot_mark_a_payment_paid(): void
    {
        $intent = ['amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];
        Http::fake(['*' => Http::response(['status' => 'pending'])]);

        $coingate = (new CoingateDriver)->verify(['api_token' => 'test'], 500000, ['id' => 'order_001', 'status' => 'paid'], $intent + ['coingate_id' => 'order_001']);
        $cryptomus = (new CryptomusDriver)->verify(['merchant_id' => 'test', 'api_key' => 'test'], 500000, ['uuid' => 'order_001', 'status' => 'paid'], $intent + ['cryptomus_uuid' => 'order_001']);
        $nowpayments = (new NowpaymentsDriver)->verify(['api_key' => 'test'], 500000, ['payment_id' => 'payment_001', 'payment_status' => 'finished'], $intent + ['nowpayments_id' => 'invoice_001']);

        $this->assertFalse($coingate['ok']);
        $this->assertFalse($cryptomus['ok']);
        $this->assertFalse($nowpayments['ok']);
        Http::assertSentCount(3);
    }

    public function test_provider_amount_must_match_the_payment_intent(): void
    {
        $intent = ['amount_rial' => 500000, 'fx_amount' => 100, 'fx_currency' => 'USD'];
        Http::fake(['*' => Http::response(['id' => 'order_001', 'status' => 'paid', 'price_amount' => '0.99', 'price_currency' => 'USD'])]);
        $result = (new CoingateDriver)->verify(['api_token' => 'test'], 500000, ['id' => 'order_001'], $intent + ['coingate_id' => 'order_001']);
        $this->assertFalse($result['ok']);
    }
}
