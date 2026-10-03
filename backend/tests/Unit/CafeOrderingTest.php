<?php

namespace Tests\Unit;

use App\Services\Cafe\CafeOrdering;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

class CafeOrderingTest extends TestCase
{
    public function test_persian_weekday_maps_to_english_key(): void
    {
        $this->assertSame('saturday', CafeOrdering::dayKey('شنبه'));
        $this->assertSame('friday', CafeOrdering::dayKey('جمعه'));
        $this->assertSame('monday', CafeOrdering::dayKey('Monday'));
    }

    public function test_holiday_closes_the_venue(): void
    {
        $status = CafeOrdering::openAt([
            'timezone' => 'Asia/Tehran',
            'closed_dates' => ['2026-10-03'],
            'days' => [
                ['day' => 'saturday', 'open' => '09:00', 'close' => '23:00', 'closed' => false],
            ],
        ], Carbon::parse('2026-10-03 18:00:00', 'Asia/Tehran'));

        $this->assertFalse($status['is_open']);
        $this->assertSame('holiday', $status['reason']);
    }

    public function test_overnight_hours_stay_open_after_midnight(): void
    {
        $status = CafeOrdering::openAt([
            'timezone' => 'Asia/Tehran',
            'days' => [
                ['day' => 'friday', 'open' => '18:00', 'close' => '02:00'],
            ],
        ], Carbon::parse('2026-10-03 01:15:00', 'Asia/Tehran'));

        $this->assertTrue($status['is_open']);
    }
}

