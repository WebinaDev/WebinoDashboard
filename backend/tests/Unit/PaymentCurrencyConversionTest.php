<?php

namespace Tests\Unit;

use App\Models\Order;
use App\Services\Payments\PaymentCheckoutService;
use Tests\TestCase;

class PaymentCurrencyConversionTest extends TestCase
{
    public function test_missing_exchange_rate_does_not_fall_back_to_toman(): void
    {
        $service = new class extends PaymentCheckoutService
        {
            public function __construct() {}

            protected function amountCurrency(Order $order): string
            {
                return 'USD';
            }

            public function convert(Order $order): int
            {
                return $this->amountInRials($order);
            }
        };
        $order = new Order(['total_minor' => 100]);

        $this->expectException(\DomainException::class);
        $this->expectExceptionMessage(__('api.payment_currency_conversion_failed'));
        $service->convert($order);
    }
    public function test_cart_does_not_fall_back_to_toman_when_exchange_rate_is_missing(): void
    {
        $service = new class extends PaymentCheckoutService
        {
            public function __construct() {}

            protected function amountCurrency(Order $order): string
            {
                return 'USD';
            }

            public function convertCart(Order $order): array
            {
                return $this->cartList($order, 100);
            }
        };
        $order = new Order;
        $order->setRelation('items', collect([(object) ['quantity' => 1, 'unit_price_minor' => 100]]));

        $this->expectException(\DomainException::class);
        $this->expectExceptionMessage(__('api.payment_currency_conversion_failed'));
        $service->convertCart($order);
    }

    public function test_zero_and_negative_amounts_are_not_changed_to_one_rial(): void
    {
        $service = new class extends PaymentCheckoutService
        {
            public function __construct() {}

            protected function amountCurrency(Order $order): string
            {
                return 'IRR';
            }

            public function convert(Order $order, int $amount): int
            {
                return $this->amountInRials($order, $amount);
            }
        };
        $order = new Order;

        foreach ([0, -1] as $amount) {
            try {
                $service->convert($order, $amount);
                $this->fail('A non-positive amount must not be sent to a gateway.');
            } catch (\DomainException $e) {
                $this->assertSame(__('api.payment_amount_must_be_positive'), $e->getMessage());
            }
        }

        $this->assertSame(10, $service->convert($order, 10));
    }

}
