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
}
