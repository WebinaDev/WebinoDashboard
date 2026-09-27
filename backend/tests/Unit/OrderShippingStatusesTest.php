<?php

namespace Tests\Unit;

use App\Models\Order;
use App\Services\Orders\OrderShippingStatuses;
use App\Services\Orders\OrderStatusTransitions;
use PHPUnit\Framework\TestCase;

class OrderShippingStatusesTest extends TestCase
{
    public function test_statutes_include_shipping_slugs(): void
    {
        $this->assertContains('webino-packaged', Order::STATUSES);
        $this->assertContains('sent-to-warehouse', Order::STATUSES);
        $this->assertContains('webino-need-review', Order::STATUSES);
    }

    public function test_tapin_code_mapping(): void
    {
        $this->assertSame('webino-packaged', OrderShippingStatuses::fromTapinCode(1));
        $this->assertSame('completed', OrderShippingStatuses::fromTapinCode(7));
        $this->assertSame('webino-returned', OrderShippingStatuses::fromTapinCode(10));
        $this->assertSame('webino-need-review', OrderShippingStatuses::fromTapinCode(99));
        $this->assertNull(OrderShippingStatuses::fromTapinCode(0));
    }

    public function test_sms_map_for_shipping(): void
    {
        $this->assertSame('packaged', OrderShippingStatuses::smsEventFor('webino-packaged'));
        $this->assertSame('sent-to-warehouse', OrderShippingStatuses::smsEventFor('webino-in-stock'));
        $this->assertSame('courier', OrderShippingStatuses::smsEventFor('webino-courier'));
    }

    public function test_transition_paid_to_processing(): void
    {
        $this->assertTrue(OrderStatusTransitions::canTransition('paid', 'processing'));
        $this->assertTrue(OrderStatusTransitions::canTransition('webino-packaged', 'webino-courier'));
        $this->assertFalse(OrderStatusTransitions::canTransition('completed', 'pending_payment'));
    }
}
