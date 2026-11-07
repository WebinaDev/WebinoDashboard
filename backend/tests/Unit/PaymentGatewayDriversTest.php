<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\AghayepardakhtDriver;
use App\Services\Payments\Drivers\BitpayDriver;
use App\Services\Payments\Drivers\CoingateDriver;
use App\Services\Payments\Drivers\CryptomusDriver;
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Payments\Drivers\JibitDriver;
use App\Services\Payments\Drivers\MellatDriver;
use App\Services\Payments\Drivers\NowpaymentsDriver;
use App\Services\Payments\Drivers\ParsianDriver;
use App\Services\Payments\Drivers\PaypalDriver;
use App\Services\Payments\Drivers\PaystarDriver;
use App\Services\Payments\Drivers\PerfectMoneyDriver;
use App\Services\Payments\Drivers\SadadDriver;
use App\Services\Payments\Drivers\SamanDriver;
use App\Services\Payments\Drivers\ShepaDriver;
use App\Services\Payments\Drivers\StripeDriver;
use App\Services\Payments\Drivers\VandarDriver;
use App\Services\Payments\PaymentGatewayCatalog;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentGatewayDriversTest extends TestCase
{
    public function test_registry_marks_new_drivers_live(): void
    {
        $registry = app(GatewayDriverRegistry::class);
        $catalog = app(PaymentGatewayCatalog::class);
        foreach ([
            'vandar', 'aghayepardakht', 'bitpay', 'saman', 'sadad', 'parsian', 'mellat',
            'stripe', 'paypal', 'nowpayments', 'cryptomus', 'coingate',
            'shepa', 'paystar', 'jibit', 'parspal', 'payfa', 'easypay', 'zarinplus', 'toman', 'tara',
            'asanpardakht', 'pasargad', 'sepehr', 'saderat', 'samankish', 'irankish', 'omidpay',
            'iran_wallet', 'perfect_money', 'payeer', 'coinpayments', 'binance_pay', 'ircryptopay',
        ] as $code) {
            $this->assertTrue($registry->has($code), $code);
            $this->assertSame('live', $registry->get($code)?->status(), $code);
            $this->assertFalse($catalog->isScaffold($code), $code);
        }
        $this->assertSame([], array_values(array_filter(
            $catalog->ids(),
            fn (string $id) => $catalog->isScaffold($id)
        )));
    }

    public function test_vandar_request_and_verify(): void
    {
        Http::fake([
            'ipg.vandar.io/api/v4/send' => Http::response(['status' => 1, 'token' => 'tok-v']),
            'ipg.vandar.io/api/v4/verify' => Http::response(['status' => 1, 'amount' => 10000, 'transId' => 'T1']),
        ]);
        $driver = new VandarDriver;
        $req = $driver->request(['api_key' => 'k'], 10000, 'https://cb.test', 'desc', ['order_id' => 9]);
        $this->assertTrue($req['ok']);
        $this->assertStringContainsString('tok-v', $req['redirect_url']);
        $ver = $driver->verify(['api_key' => 'k'], 10000, ['token' => 'tok-v', 'payment_status' => 1], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('T1', $ver['ref_id']);
    }

    public function test_aghayepardakht_uses_toman_and_sandbox_pin(): void
    {
        Http::fake([
            'panel.aqayepardakht.ir/api/v2/create' => Http::response(['status' => 'success', 'transid' => 'tr1']),
            'panel.aqayepardakht.ir/api/v2/verify' => Http::response(['status' => 'success', 'code' => '1']),
        ]);
        $driver = new AghayepardakhtDriver;
        $req = $driver->request(['pin' => 'real', 'sandbox' => true], 100000, 'https://cb.test', 'd', ['order_id' => 1]);
        $this->assertTrue($req['ok']);
        $this->assertSame(10000, $req['meta']['amount_toman']);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/create') && $r['pin'] === 'sandbox' && $r['amount'] === 10000);
        $ver = $driver->verify(['pin' => 'real', 'sandbox' => true], 100000, ['status' => '1', 'transid' => 'tr1'], $req['meta']);
        $this->assertTrue($ver['ok']);
    }

    public function test_bitpay_parses_numeric_body(): void
    {
        Http::fake([
            'bitpay.ir/payment/gateway-send' => Http::response('4242'),
            'bitpay.ir/payment/gateway-result-second' => Http::response('1'),
        ]);
        $driver = new BitpayDriver;
        $req = $driver->request(['api_key' => 'k'], 50000, 'https://cb.test', 'd', []);
        $this->assertTrue($req['ok']);
        $this->assertSame('4242', $req['authority']);
        $ver = $driver->verify(['api_key' => 'k'], 50000, ['id_get' => '4242', 'trans_id' => '99'], $req['meta']);
        $this->assertTrue($ver['ok']);
    }

    public function test_saman_token_flow(): void
    {
        Http::fake([
            'sep.shaparak.ir/onlinepg/onlinepg' => Http::response(['status' => 1, 'token' => 'SEPTOK']),
            'sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction' => Http::response([
                'Success' => true,
                'ResultCode' => 0,
                'TransactionDetail' => ['OrginalAmount' => 20000, 'RRN' => 'rrn1'],
            ]),
        ]);
        $driver = new SamanDriver;
        $req = $driver->request(['terminal_id' => '123', 'sandbox' => false], 20000, 'https://cb.test', 'd', ['order_id' => 7]);
        $this->assertTrue($req['ok']);
        $this->assertSame('7', $req['meta']['saman_res_num']);
        $ver = $driver->verify(['terminal_id' => '123', 'sandbox' => false], 20000, ['State' => 'OK', 'RefNum' => 'REF'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('rrn1', $ver['ref_id']);
    }

    public function test_sadad_sign_and_verify(): void
    {
        // 24-byte key for 3DES, base64.
        $key = base64_encode(str_repeat('k', 24));
        Http::fake([
            'sadad.shaparak.ir/VPG/api/v0/Request/PaymentRequest' => Http::response(['ResCode' => '0', 'Token' => 'SDTOK']),
            'sadad.shaparak.ir/VPG/api/v0/Advice/Verify' => Http::response(['ResCode' => '0', 'Amount' => 30000, 'RetrivalRefNo' => 'R1']),
        ]);
        $driver = new SadadDriver;
        $req = $driver->request([
            'terminal_id' => 'T1',
            'merchant_id' => 'M1',
            'terminal_key' => $key,
            'sandbox' => false,
        ], 30000, 'https://cb.test', 'd', ['order_id' => 3]);
        $this->assertTrue($req['ok']);
        $ver = $driver->verify([
            'terminal_id' => 'T1',
            'merchant_id' => 'M1',
            'terminal_key' => $key,
            'sandbox' => false,
        ], 30000, ['ResCode' => '0', 'token' => 'SDTOK'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('R1', $ver['ref_id']);
    }

    public function test_parsian_soap_sale_and_confirm(): void
    {
        $saleXml = '<?xml version="1.0"?><Envelope><Body><SalePaymentRequestResponse><SalePaymentRequestResult><Status>0</Status><Token>PT1</Token></SalePaymentRequestResult></SalePaymentRequestResponse></Body></Envelope>';
        $confirmXml = '<?xml version="1.0"?><Envelope><Body><ConfirmPaymentResponse><ConfirmPaymentResult><Status>0</Status><RRN>991</RRN></ConfirmPaymentResult></ConfirmPaymentResponse></Body></Envelope>';
        Http::fake([
            'pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx' => Http::response($saleXml, 200, ['Content-Type' => 'text/xml']),
            'pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx' => Http::response($confirmXml, 200, ['Content-Type' => 'text/xml']),
        ]);
        $driver = new ParsianDriver;
        $req = $driver->request(['login_account' => 'login'], 40000, 'https://cb.test', 'd', ['order_id' => 11]);
        $this->assertTrue($req['ok']);
        $this->assertSame('PT1', $req['authority']);
        $ver = $driver->verify(['login_account' => 'login'], 40000, ['status' => 0, 'Token' => 'PT1'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('991', $ver['ref_id']);
    }

    public function test_mellat_pay_verify_settle(): void
    {
        Http::fakeSequence()
            ->push('<?xml version="1.0"?><Envelope><Body><bpPayRequestResponse><return>0,REFM</return></bpPayRequestResponse></Body></Envelope>')
            ->push('<?xml version="1.0"?><Envelope><Body><bpVerifyRequestResponse><return>0</return></bpVerifyRequestResponse></Body></Envelope>')
            ->push('<?xml version="1.0"?><Envelope><Body><bpSettleRequestResponse><return>0</return></bpSettleRequestResponse></Body></Envelope>');
        $driver = new MellatDriver;
        $req = $driver->request([
            'terminal_id' => '1',
            'username' => 'u',
            'password' => 'p',
        ], 50000, 'https://cb.test', 'd', ['order_id' => 5]);
        $this->assertTrue($req['ok']);
        $this->assertSame('REFM', $req['authority']);
        $ver = $driver->verify([
            'terminal_id' => '1',
            'username' => 'u',
            'password' => 'p',
        ], 50000, [
            'ResCode' => '0',
            'SaleReferenceId' => 'SALE1',
            'RefId' => 'REFM',
            'SaleOrderId' => '5',
        ], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('SALE1', $ver['ref_id']);
    }

    public function test_stripe_requires_rial_per_unit_and_creates_session(): void
    {
        Http::fake([
            'api.stripe.com/v1/checkout/sessions' => Http::response([
                'id' => 'cs_test_1',
                'url' => 'https://checkout.stripe.com/pay/cs_test_1',
            ]),
            'api.stripe.com/v1/checkout/sessions/cs_test_1' => Http::response([
                'payment_status' => 'paid',
                'payment_intent' => 'pi_1',
            ]),
        ]);
        $driver = new StripeDriver;
        $missing = $driver->request(['secret_key' => 'sk', 'currency' => 'USD', 'rial_per_unit' => 0], 100000, 'https://cb.test', 'd');
        $this->assertFalse($missing['ok']);
        $req = $driver->request(['secret_key' => 'sk', 'currency' => 'USD', 'rial_per_unit' => 500000], 1000000, 'https://cb.test', 'Order');
        $this->assertTrue($req['ok']);
        $this->assertSame('cs_test_1', $req['authority']);
        $ver = $driver->verify(['secret_key' => 'sk'], 1000000, ['session_id' => 'cs_test_1'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('pi_1', $ver['ref_id']);
    }

    public function test_paypal_orders_capture(): void
    {
        Http::fake([
            'api-m.sandbox.paypal.com/v1/oauth2/token' => Http::response(['access_token' => 'at']),
            'api-m.sandbox.paypal.com/v2/checkout/orders' => Http::response([
                'id' => 'PO1',
                'links' => [['rel' => 'approve', 'href' => 'https://paypal.test/approve']],
            ]),
            'api-m.sandbox.paypal.com/v2/checkout/orders/PO1/capture' => Http::response([
                'status' => 'COMPLETED',
                'purchase_units' => [['payments' => ['captures' => [['id' => 'CAP1', 'status' => 'COMPLETED']]]]],
            ]),
        ]);
        $driver = new PaypalDriver;
        $req = $driver->request([
            'client_id' => 'id',
            'client_secret' => 'sec',
            'sandbox' => true,
            'currency' => 'USD',
            'rial_per_unit' => 500000,
        ], 500000, 'https://cb.test', 'd', ['order_id' => 1]);
        $this->assertTrue($req['ok']);
        $ver = $driver->verify([
            'client_id' => 'id',
            'client_secret' => 'sec',
            'sandbox' => true,
        ], 500000, ['token' => 'PO1'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('CAP1', $ver['ref_id']);
    }

    public function test_nowpayments_invoice(): void
    {
        Http::fake([
            'api.nowpayments.io/v1/invoice' => Http::response(['id' => 'inv1', 'invoice_url' => 'https://nowpayments.io/i/inv1']),
            'api.nowpayments.io/v1/payment/pay1' => Http::response(['payment_id' => 'pay1', 'payment_status' => 'finished']),
        ]);
        $driver = new NowpaymentsDriver;
        $req = $driver->request([
            'api_key' => 'k',
            'currency' => 'USD',
            'rial_per_unit' => 500000,
        ], 500000, 'https://shop.test/cb', 'd', ['order_id' => 2]);
        $this->assertTrue($req['ok']);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/invoice') && ($r['ipn_callback_url'] ?? '') === 'https://shop.test/api/v1/payments/webhook/nowpayments');
        $ver = $driver->verify(['api_key' => 'k'], 500000, ['payment_id' => 'pay1'], $req['meta']);
        $this->assertTrue($ver['ok']);
    }

    public function test_cryptomus_and_coingate(): void
    {
        Http::fake([
            'api.cryptomus.com/v1/payment' => Http::response(['result' => ['uuid' => 'cu1', 'url' => 'https://pay.cryptomus.com/cu1']]),
            'api.cryptomus.com/v1/payment/info' => Http::response(['result' => ['uuid' => 'cu1', 'payment_status' => 'paid']]),
            'api.coingate.com/v2/orders' => Http::response(['id' => 55, 'payment_url' => 'https://coingate.com/55']),
            'api.coingate.com/v2/orders/55' => Http::response(['id' => 55, 'status' => 'paid']),
        ]);
        $crypto = new CryptomusDriver;
        $req = $crypto->request([
            'merchant_id' => 'm',
            'api_key' => 'k',
            'currency' => 'USD',
            'rial_per_unit' => 400000,
        ], 400000, 'https://shop.test/cb', 'd', ['order_id' => 'o1']);
        $this->assertTrue($req['ok']);
        $ver = $crypto->verify(['merchant_id' => 'm', 'api_key' => 'k'], 400000, [], $req['meta']);
        $this->assertTrue($ver['ok']);

        $cg = new CoingateDriver;
        $req2 = $cg->request([
            'api_token' => 't',
            'currency' => 'USD',
            'rial_per_unit' => 400000,
            'sandbox' => false,
        ], 400000, 'https://shop.test/cb', 'd', ['order_id' => 'o2']);
        $this->assertTrue($req2['ok']);
        $ver2 = $cg->verify(['api_token' => 't', 'sandbox' => false], 400000, ['id' => '55'], $req2['meta']);
        $this->assertTrue($ver2['ok']);
    }

    public function test_shepa_and_paystar_flows(): void
    {
        Http::fake([
            'sandbox.shepa.com/api/v1/token' => Http::response([
                'success' => true,
                'result' => ['token' => 'SH1', 'url' => 'https://sandbox.shepa.com/v1/SH1'],
            ]),
            'sandbox.shepa.com/api/v1/verify' => Http::response([
                'success' => true,
                'result' => ['refid' => 'RSH'],
            ]),
            'core.paystar.ir/api/pardakht/create' => Http::response([
                'status' => 1,
                'data' => ['token' => 'PST', 'ref_num' => 'REF9'],
            ]),
            'core.paystar.ir/api/pardakht/verify' => Http::response(['status' => 1]),
        ]);
        $shepa = new ShepaDriver;
        $req = $shepa->request(['api_key' => 'k', 'sandbox' => true], 10000, 'https://cb.test', 'd');
        $this->assertTrue($req['ok']);
        $this->assertSame('SH1', $req['authority']);
        $ver = $shepa->verify(['api_key' => 'k', 'sandbox' => true], 10000, ['status' => 'success', 'token' => 'SH1'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('RSH', $ver['ref_id']);

        $paystar = new PaystarDriver;
        $req2 = $paystar->request(['api_key' => 'gw', 'sign_key' => 'sk'], 20000, 'https://cb.test', 'd', ['order_id' => '42']);
        $this->assertTrue($req2['ok']);
        $this->assertSame('REF9', $req2['authority']);
        $ver2 = $paystar->verify(
            ['api_key' => 'gw', 'sign_key' => 'sk'],
            20000,
            ['status' => 1, 'ref_num' => 'REF9', 'card_number' => '6037-****', 'tracking_code' => 'TR1'],
            $req2['meta']
        );
        $this->assertTrue($ver2['ok']);
        $this->assertSame('TR1', $ver2['ref_id']);
    }

    public function test_jibit_token_purchase_and_perfect_money_form_bridge(): void
    {
        Http::fake([
            'napi.jibit.ir/ppg/v3/tokens' => Http::response(['accessToken' => 'jt']),
            'napi.jibit.ir/ppg/v3/purchases' => Http::response([
                'purchaseId' => 'JP1',
                'pspSwitchingUrl' => 'https://jibit.ir/pay/JP1',
            ]),
            'napi.jibit.ir/ppg/v3/purchases/JP1/verify' => Http::response([
                'status' => 'SUCCESSFUL',
                'pspReferenceNumber' => 'PR1',
            ]),
        ]);
        $jibit = new JibitDriver;
        $req = $jibit->request(['api_key' => 'a', 'secret_key' => 's'], 15000, 'https://cb.test', 'd', ['order_id' => '9']);
        $this->assertTrue($req['ok']);
        $this->assertSame('JP1', $req['authority']);
        $ver = $jibit->verify(['api_key' => 'a', 'secret_key' => 's'], 15000, ['status' => 'SUCCESSFUL', 'purchaseId' => 'JP1'], $req['meta']);
        $this->assertTrue($ver['ok']);
        $this->assertSame('PR1', $ver['ref_id']);

        $pm = new PerfectMoneyDriver;
        $missing = $pm->request(['payee_account' => 'U1', 'passphrase' => 'p', 'currency' => 'USD', 'rial_per_unit' => 0], 100000, 'https://cb.test', 'd');
        $this->assertFalse($missing['ok']);
        $req2 = $pm->request([
            'payee_account' => 'U123',
            'passphrase' => 'secret',
            'currency' => 'USD',
            'rial_per_unit' => 500000,
            'title' => 'Shop',
        ], 500000, 'https://shop.test/api/v1/payments/callback/perfect_money/1', 'Order', ['order_id' => '77']);
        $this->assertTrue($req2['ok']);
        $this->assertSame('form-bridge', $req2['redirect_url']);
        $this->assertSame('https://perfectmoney.com/api/step1.asp', $req2['meta']['form_action']);
        $this->assertSame('77', $req2['meta']['form_fields']['PAYMENT_ID']);

        $pass = strtoupper(md5('secret'));
        $callback = [
            'PAYMENT_ID' => '77',
            'PAYEE_ACCOUNT' => 'U123',
            'PAYMENT_AMOUNT' => '1.00',
            'PAYMENT_UNITS' => 'USD',
            'PAYMENT_BATCH_NUM' => 'B9',
            'PAYER_ACCOUNT' => 'U999',
            'TIMESTAMPGMT' => '1700000000',
        ];
        $callback['V2_HASH'] = strtoupper(md5(implode(':', [
            $callback['PAYMENT_ID'],
            $callback['PAYEE_ACCOUNT'],
            $callback['PAYMENT_AMOUNT'],
            $callback['PAYMENT_UNITS'],
            $callback['PAYMENT_BATCH_NUM'],
            $callback['PAYER_ACCOUNT'],
            $pass,
            $callback['TIMESTAMPGMT'],
        ])));
        $ver2 = $pm->verify(['payee_account' => 'U123', 'passphrase' => 'secret'], 500000, $callback, $req2['meta']);
        $this->assertTrue($ver2['ok']);
        $this->assertSame('B9', $ver2['ref_id']);
    }
}
