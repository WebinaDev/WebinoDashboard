<?php

namespace Tests\Unit;

use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Tests\TestCase;

class ForeignGatewayPrecisionTest extends TestCase
{
    public function test_foreign_currency_conversion_requires_an_exact_representable_amount(): void
    {
        $converter = new class
        {
            use ConvertsFxAmount;

            public function convert(int $amount, mixed $rate): array
            {
                return $this->fxMinorAmount(['currency' => 'USD', 'rial_per_unit' => $rate], $amount);
            }

            public function format(int $amount, int $precision = 2, string $currency = ''): string
            {
                return $this->fxMajorAmount($amount, $precision, $currency);
            }
        };

        $this->assertSame(['ok' => true, 'amount' => 200, 'currency' => 'USD'], $converter->convert(1000000, '500000'));
        $this->assertSame(['ok' => true, 'amount' => 200, 'currency' => 'USD'], $converter->convert(25, '12.5'));
        $this->assertSame('90071992547409.93', $converter->format(9007199254740993));
        $this->assertSame('1.01000000', $converter->format(101, 8));
        $this->assertSame('101.00', $converter->format(101, 2, 'IRR'));
        $this->assertSame('10.00', $converter->format(10, 2, 'IRT'));
        $this->assertFalse($converter->convert(1, '500000')['ok']);
        $this->assertFalse($converter->convert(1000001, '500000')['ok']);
        $this->assertFalse($converter->convert(PHP_INT_MAX, '0.001')['ok']);
        foreach ([null, 0, -1, '', 'invalid', [], INF, '1e999999', str_repeat('9', 65)] as $rate) {
            $this->assertFalse($converter->convert(100, $rate)['ok']);
        }
    }
}
