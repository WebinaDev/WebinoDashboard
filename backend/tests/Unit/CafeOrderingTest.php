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

    /** @param  list<array<string, mixed>>  $days */
    private function at(array $days, string $when): ?bool
    {
        return CafeOrdering::openAt(['timezone' => 'Asia/Tehran', 'days' => $days], Carbon::parse($when, 'Asia/Tehran'))['is_open'];
    }

    public function test_closes_exactly_at_close_time(): void
    {
        // 2026-10-12 is a Monday.
        $days = [['day' => 'monday', 'open' => '09:00', 'close' => '23:00']];
        $this->assertTrue($this->at($days, '2026-10-12 22:59:00'));
        $this->assertFalse($this->at($days, '2026-10-12 23:00:00'));
        $this->assertFalse($this->at($days, '2026-10-12 23:30:00'));
        $this->assertTrue($this->at($days, '2026-10-12 09:00:00'));
        $this->assertFalse($this->at($days, '2026-10-12 08:59:00'));
    }

    public function test_minute_precision_close(): void
    {
        $days = [['day' => 'monday', 'open' => '09:15', 'close' => '22:45']];
        $this->assertTrue($this->at($days, '2026-10-12 22:44:00'));
        $this->assertFalse($this->at($days, '2026-10-12 22:45:00'));
        $this->assertFalse($this->at($days, '2026-10-12 09:14:00'));
    }

    public function test_overnight_range_closes_at_close_time_next_day(): void
    {
        // Sunday 18:00 to 02:00; Monday has no hours.
        $days = [['day' => 'sunday', 'open' => '18:00', 'close' => '02:00'], ['day' => 'monday', 'closed' => true]];
        $this->assertTrue($this->at($days, '2026-10-11 23:59:00'));
        $this->assertTrue($this->at($days, '2026-10-12 01:59:00'));
        $this->assertFalse($this->at($days, '2026-10-12 02:00:00'));
        $this->assertFalse($this->at($days, '2026-10-11 17:59:00'));
    }

    public function test_overnight_does_not_open_early_morning_when_yesterday_closed(): void
    {
        $days = [['day' => 'sunday', 'closed' => true], ['day' => 'monday', 'open' => '18:00', 'close' => '02:00']];
        $this->assertFalse($this->at($days, '2026-10-12 01:00:00'));
        $this->assertTrue($this->at($days, '2026-10-12 19:00:00'));
    }

    public function test_midnight_closes(): void
    {
        $zero = [['day' => 'monday', 'open' => '09:00', 'close' => '00:00']];
        $this->assertTrue($this->at($zero, '2026-10-12 23:59:00'));
        $this->assertFalse($this->at($zero, '2026-10-13 00:00:00'));

        $full = [['day' => 'monday', 'open' => '09:00', 'close' => '24:00']];
        $this->assertTrue($this->at($full, '2026-10-12 23:59:00'));
        $this->assertFalse($this->at($full, '2026-10-12 08:00:00'));

        $allDay = [['day' => 'monday', 'open' => '00:00', 'close' => '24:00']];
        $this->assertTrue($this->at($allDay, '2026-10-12 00:00:00'));
    }
}
