<?php

namespace Tests\Feature;

use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Services\ServingWindows;
use Tests\TestCase;

/**
 * A menu with times on it.
 *
 * The three cases that decide whether this is usable: a plain window, one that crosses midnight,
 * and the absence of any window — which must mean "always available", because making it mean
 * "never" would hide the whole menu the day the feature ships.
 */
class ServingWindowsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'windows.test', 'slug' => 'sw']);
    }

    private function product(string $name = 'Soup'): int
    {
        return (int) DB::table('products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => $name,
            'slug' => strtolower(str_replace(' ', '-', $name)).'-'.uniqid(),
            'price_minor' => 100_000,
            'status' => 'publish',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** An item with no window is always available. */
    public function test_no_window_means_always_available(): void
    {
        $productId = $this->product();

        $status = app(ServingWindows::class)->statusFor((int) $this->tenant->id, $productId, null);

        $this->assertTrue($status['available']);
        $this->assertNull($status['window_id']);
    }

    /** Inside the window it sells; outside it does not, and the next opening is stated. */
    public function test_a_window_opens_and_closes(): void
    {
        $productId = $this->product('Breakfast omelette');

        app(ServingWindows::class)->save((int) $this->tenant->id, [
            'label' => 'صبحانه',
            'product_id' => $productId,
            'start_time' => '08:00',
            'end_time' => '11:00',
        ]);

        $service = app(ServingWindows::class);

        $morning = $service->statusFor((int) $this->tenant->id, $productId, null, now()->setTime(9, 30));
        $afternoon = $service->statusFor((int) $this->tenant->id, $productId, null, now()->setTime(15, 0));

        $this->assertTrue($morning['available']);
        $this->assertFalse($afternoon['available']);
        $this->assertNotNull($afternoon['next_opens_at'], 'the till must be able to say when it opens again');
    }

    /** 22:00 to 02:00 is a shisha menu, not a validation error. */
    public function test_a_window_may_cross_midnight(): void
    {
        $productId = $this->product('Shisha');

        app(ServingWindows::class)->save((int) $this->tenant->id, [
            'product_id' => $productId,
            'start_time' => '22:00',
            'end_time' => '02:00',
        ]);

        $service = app(ServingWindows::class);

        $this->assertTrue($service->statusFor((int) $this->tenant->id, $productId, null, now()->setTime(23, 0))['available']);
        $this->assertTrue($service->statusFor((int) $this->tenant->id, $productId, null, now()->setTime(1, 0))['available']);
        $this->assertFalse($service->statusFor((int) $this->tenant->id, $productId, null, now()->setTime(12, 0))['available']);
    }

    /** A category window closes its items, unless an item has a window of its own. */
    public function test_a_product_window_overrides_its_category(): void
    {
        $categoryId = (int) DB::table('categories')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'صبحانه',
            'slug' => 'breakfast-'.uniqid(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $plain = (int) DB::table('products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'category_id' => $categoryId,
            'name' => 'Plain omelette',
            'slug' => 'plain-'.uniqid(),
            'price_minor' => 100_000,
            'status' => 'publish',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $allDay = (int) DB::table('products')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'category_id' => $categoryId,
            'name' => 'All-day toast',
            'slug' => 'toast-'.uniqid(),
            'price_minor' => 60_000,
            'status' => 'publish',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $service = app(ServingWindows::class);

        $service->save((int) $this->tenant->id, [
            'label' => 'صبحانه',
            'category_id' => $categoryId,
            'start_time' => '08:00',
            'end_time' => '11:00',
        ]);

        // One item is served all day despite its category being closed.
        $service->save((int) $this->tenant->id, [
            'label' => 'همیشه',
            'product_id' => $allDay,
            'start_time' => '00:00',
            'end_time' => '23:59',
        ]);

        $at = now()->setTime(15, 0);

        $this->assertFalse($service->statusFor((int) $this->tenant->id, $plain, $categoryId, $at)['available']);
        $this->assertTrue($service->statusFor((int) $this->tenant->id, $allDay, $categoryId, $at)['available']);

        $blocked = $service->unavailableProductIds((int) $this->tenant->id, $at);
        $this->assertContains($plain, $blocked);
        $this->assertNotContains($allDay, $blocked);
    }

    /** Weekdays narrow a window; an empty list means every day. */
    public function test_weekdays_narrow_the_window(): void
    {
        $productId = $this->product('Friday special');

        // Monday only (0 = Monday on the wire).
        app(ServingWindows::class)->save((int) $this->tenant->id, [
            'product_id' => $productId,
            'weekdays' => [0],
            'start_time' => '08:00',
            'end_time' => '23:00',
        ]);

        $service = app(ServingWindows::class);
        $monday = now()->startOfWeek()->setTime(12, 0);
        $tuesday = now()->startOfWeek()->addDay()->setTime(12, 0);

        $this->assertTrue($service->statusFor((int) $this->tenant->id, $productId, null, $monday)['available']);
        $this->assertFalse($service->statusFor((int) $this->tenant->id, $productId, null, $tuesday)['available']);
    }

    /** A zero-length window is refused rather than silently hiding an item forever. */
    public function test_a_zero_length_window_is_refused(): void
    {
        $productId = $this->product();

        $this->expectException(\Illuminate\Validation\ValidationException::class);

        app(ServingWindows::class)->save((int) $this->tenant->id, [
            'product_id' => $productId,
            'start_time' => '12:00',
            'end_time' => '12:00',
        ]);
    }
}
