<?php

namespace Tests\Unit;

use App\Services\Marketplace\Basalam\BasalamErrors;
use App\Services\Marketplace\Basalam\BasalamOrders;
use PHPUnit\Framework\TestCase;

/** Plugin v0.9.65 parity: line totals, fee-by-title, Persian transport errors. */
class BasalamParityTest extends TestCase
{
    public function test_line_total_row_is_sum_over_units(): void
    {
        $item = ['quantity' => 3, 'financial_report' => ['report_items' => [['title' => 'قیمت محصول', 'amount' => 300000]]]];
        $this->assertSame(300000, BasalamOrders::lineTotalRial($item, 3));
    }

    public function test_line_total_row_equal_to_unit_is_multiplied(): void
    {
        $item = ['price' => 100000, 'financial_report' => ['report_items' => [['title' => 'قیمت محصول', 'amount' => 100000]]]];
        $this->assertSame(300000, BasalamOrders::lineTotalRial($item, 3));
    }

    public function test_line_total_falls_back_to_unit_times_qty(): void
    {
        $this->assertSame(50000, BasalamOrders::lineTotalRial(['price' => 25000], 2));
    }

    public function test_fee_found_by_title_not_position(): void
    {
        $raw = ['financial_report' => ['product_cost' => ['report_items' => [
            ['title' => 'کارمزد باسلام', 'amount' => -12000],
            ['title' => 'قیمت', 'amount' => 1],
            ['title' => 'x', 'amount' => 999],
        ]]]];
        $this->assertSame(-12000.0, BasalamOrders::feeAmountRial($raw));
    }

    public function test_curl_18_is_persian(): void
    {
        $msg = BasalamErrors::transport('cURL error 18: transfer closed with 100 bytes remaining');
        $this->assertStringContainsString('ناقص', $msg);
        $this->assertStringNotContainsString('cURL', $msg);
    }
}
