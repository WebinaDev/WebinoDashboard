<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\AghayepardakhtDriver;
use App\Services\Payments\Drivers\BitpayDriver;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use App\Services\Payments\Drivers\EasypayDriver;
use App\Services\Payments\Drivers\IranWalletDriver;
use App\Services\Payments\Drivers\NextpayDriver;
use App\Services\Payments\Drivers\ParspalDriver;
use App\Services\Payments\Drivers\PaypingDriver;
use App\Services\Payments\Drivers\ZarinpalDriver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TomanGatewayPrecisionTest extends TestCase
{
    public function test_non_representable_amount_never_reaches_toman_gateways(): void
    {
        Http::fake();
        $drivers = [
            [new AghayepardakhtDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new BitpayDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new EasypayDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new IranWalletDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new NextpayDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new ParspalDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
            [new PaypingDriver, ['pin' => 'test', 'api_key' => 'test', 'api_token' => 'test', 'merchant_id' => 'test']],
        ];

        foreach ($drivers as [$driver, $config]) {
            foreach ([0, 1, 101, -10] as $amount) {
                $result = $driver->request($config, $amount, 'https://example.local/callback', 'test');
                $this->assertFalse($result['ok'], $driver->code());
            }
        }

        Http::assertNothingSent();
    }
    public function test_fx_toman_conversion_is_exact(): void
    {
        $converter = new class
        {
            use ConvertsFxAmount;

            public function convert(int $amount, string $currency = 'IRT'): array
            {
                return $this->fxMinorAmount(['currency' => $currency], $amount);
            }
        };

        $this->assertFalse($converter->convert(101)['ok']);
        $this->assertSame(['ok' => true, 'amount' => 10, 'currency' => 'IRT'], $converter->convert(100));
        $this->assertFalse($converter->convert(0, 'IRR')['ok']);
        $this->assertFalse($converter->convert(-10, 'USD')['ok']);
        $this->assertSame(['ok' => true, 'amount' => 100, 'currency' => 'IRR'], $converter->convert(100, 'IRR'));
    }

    public function test_dual_currency_gateway_rejects_inexact_toman_without_request(): void
    {
        Http::fake();
        $driver = new ZarinpalDriver;
        $result = $driver->request(['merchant_id' => 'test'], 101, 'https://example.local/callback', 'test', ['currency' => 'IRT']);

        $this->assertFalse($result['ok']);
        Http::assertNothingSent();
    }

    public function test_inexact_legacy_dual_currency_payment_requires_reconciliation(): void
    {
        Http::fake();
        $driver = new ZarinpalDriver;
        $result = $driver->verify(['merchant_id' => 'test'], 101, ['Authority' => 'test'], ['currency' => 'IRT']);

        $this->assertFalse($result['ok']);
        Http::assertNothingSent();
    }

}
