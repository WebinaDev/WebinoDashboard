<?php

namespace Tests\Unit;

use App\Services\Orders\Code128Barcode;
use App\Services\Orders\OrderDocumentRenderer;
use PHPUnit\Framework\TestCase;

class OrderDocumentHelpersTest extends TestCase
{
    public function test_code128_encodes_with_start_checksum_and_stop(): void
    {
        $this->assertSame([104, 33, 34, 106], Code128Barcode::encode('A'));
        $this->assertSame([104, 17, 18, 19, (104 + 17 + 18 * 2 + 19 * 3) % 103, 106], Code128Barcode::encode('123'));
        $this->assertNull(Code128Barcode::encode(''));
        $this->assertNull(Code128Barcode::encode('سفارش'));
    }

    public function test_svg_is_valid_and_empty_input_returns_nothing(): void
    {
        $svg = Code128Barcode::svg('WD-1001');
        $this->assertStringStartsWith('<svg xmlns="http://www.w3.org/2000/svg"', $svg);
        $this->assertStringContainsString('>WD-1001</text>', $svg);
        $this->assertNotFalse(simplexml_load_string($svg));

        // start + 7 chars + checksum = 9 symbols of 11 modules, stop is 13, 20px quiet zone per side
        $this->assertStringContainsString('width="'.((9 * 11 + 13) * 2 + 40).'"', $svg);

        $this->assertSame('', Code128Barcode::svg('   '));
        $this->assertSame('', Code128Barcode::dataUri('ÿ'));
        $this->assertStringStartsWith('data:image/svg+xml;base64,', Code128Barcode::dataUri('42'));
    }

    public function test_gregorian_to_jalali(): void
    {
        $this->assertSame([1405, 7, 5], OrderDocumentRenderer::toJalali(2026, 9, 27));
        $this->assertSame([1403, 1, 1], OrderDocumentRenderer::toJalali(2024, 3, 20));
        $this->assertSame([1402, 12, 29], OrderDocumentRenderer::toJalali(2024, 3, 19));
        $this->assertSame([1399, 12, 30], OrderDocumentRenderer::toJalali(2021, 3, 20));
    }
}
