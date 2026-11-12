<?php

namespace Tests\Unit;

use App\Support\Currency;
use Tests\TestCase;

class CurrencyGatewayAmountTest extends TestCase
{
    public function test_toman_store_multiplies_only_for_irr_gateways(): void
    {
        $toman = 10000;

        $this->assertSame(100000, Currency::toGatewayRial($toman, 'IRT'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'zibal'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'idpay'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'payir'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'sadad'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'mellat'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'saman'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'parsian'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'digipay'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'snapppay'));
        $this->assertSame(100000, Currency::toGatewayApiAmount($toman, 'IRT', 'torobpay'));

        $this->assertSame(10000, Currency::toGatewayApiAmount($toman, 'IRT', 'zarinpal'));
        $this->assertSame(10000, Currency::toGatewayApiAmount($toman, 'IRT', 'nextpay'));
        $this->assertSame(10000, Currency::toGatewayApiAmount($toman, 'IRT', 'payping'));

        $this->assertSame('IRR', Currency::apiUnitFor('zibal', 'IRT'));
        $this->assertSame('IRT', Currency::apiUnitFor('zarinpal', 'IRT'));
        $this->assertSame('IRR', Currency::apiUnitFor('zarinpal', 'IRR'));
    }

    public function test_null_currency_defaults_to_toman_not_rial(): void
    {
        $this->assertSame(100000, Currency::toGatewayRial(10000, null));
    }

    public function test_rial_store_is_unchanged_for_irr_gateways(): void
    {
        $this->assertSame(10000, Currency::toGatewayApiAmount(10000, 'IRR', 'zibal'));
        $this->assertSame(10000, Currency::toGatewayApiAmount(10000, 'IRR', 'zarinpal'));
        $this->assertSame(1000, Currency::toGatewayApiAmount(10000, 'IRR', 'nextpay'));
    }

    public function test_irr_row_on_irt_store_is_not_multiplied_again(): void
    {
        // bluecafe: 850,000 IRR espresso on an IRT store.
        $this->assertSame(85000, Currency::convert(850000, 'IRR', 'IRT'));
        $this->assertSame(850000, Currency::toGatewayApiAmount(850000, 'IRR', 'zibal', 'IRT'));
        $this->assertSame(85000, Currency::toGatewayApiAmount(850000, 'IRR', 'zarinpal', 'IRT'));
        $this->assertSame(850000, Currency::toGatewayApiAmount(850000, 'IRR', 'idpay', 'IRT'));
        $this->assertSame(85000, Currency::toGatewayApiAmount(850000, 'IRR', 'nextpay', 'IRT'));
    }

    public function test_mixed_irr_and_irt_rows_sum_in_canonical_rial(): void
    {
        // mars-style mixed cart: 850,000 IRR + 10,000 IRT.
        $rial = Currency::toGatewayRial(850000, 'IRR') + Currency::toGatewayRial(10000, 'IRT');
        $this->assertSame(950000, $rial);
        $this->assertSame(95000, Currency::convert(850000, 'IRR', 'IRT') + Currency::convert(10000, 'IRT', 'IRT'));
        $this->assertSame(950000, Currency::toGatewayApiAmount(95000, 'IRT', 'zibal', 'IRT'));
        $this->assertSame(95000, Currency::toGatewayApiAmount(95000, 'IRT', 'zarinpal', 'IRT'));
    }

    public function test_erp_rial_storage_on_irt_display(): void
    {
        // webina.dev: 39,000,000 IRR stored, show 3,900,000 toman, charge 39,000,000 rial.
        $this->assertSame(3900000, Currency::convert(39000000, 'IRR', 'IRT'));
        $this->assertSame(39000000, Currency::toGatewayApiAmount(39000000, 'IRR', 'zibal', 'IRT'));
        $this->assertSame(3900000, Currency::toGatewayApiAmount(39000000, 'IRR', 'zarinpal', 'IRT'));
    }

}
