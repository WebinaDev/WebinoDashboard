<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\AghayepardakhtDriver;
use App\Services\Payments\Drivers\EasypayDriver;
use App\Services\Payments\Drivers\IranWalletDriver;
use App\Services\Payments\Drivers\NextpayDriver;
use App\Services\Payments\Drivers\ParspalDriver;
use App\Services\Payments\Drivers\PaypingDriver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TomanGatewayVerificationTest extends TestCase
{
    public function test_inexact_or_mismatched_amounts_are_not_sent_for_verification(): void
    {
        Http::fake();
        $drivers = [
            [new AghayepardakhtDriver, ['status' => '1', 'transid' => 'test']],
            [new EasypayDriver, ['token' => 'test']],
            [new IranWalletDriver, ['token' => 'test']],
            [new NextpayDriver, ['trans_id' => 'test']],
            [new ParspalDriver, ['status' => '100', 'receipt_number' => 'test']],
            [new PaypingDriver, ['refid' => 'test']],
        ];

        foreach ($drivers as [$driver, $callback]) {
            $this->assertFalse($driver->verify([], 101, $callback)['ok'], $driver->code());
            $this->assertFalse($driver->verify([], 100, $callback, ['amount_toman' => 11])['ok'], $driver->code());
        }

        Http::assertNothingSent();
    }

    public function test_exact_legacy_amount_is_sent_without_rounding(): void
    {
        Http::fake(['nextpay.org/*' => Http::response(['code' => 0])]);
        $result = (new NextpayDriver)->verify(['api_key' => 'test'], 100, ['trans_id' => 'test']);

        $this->assertTrue($result['ok']);
        Http::assertSent(fn ($request) => $request['amount'] === 10);
    }
}
