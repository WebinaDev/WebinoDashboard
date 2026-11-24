<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Entities\KitchenStation;
use Modules\Cafe\Entities\StationProduct;
use Modules\Cafe\Services\KitchenStations;
use Tests\TestCase;

/**
 * The kitchen board must not get slower as the ticket line grows.
 *
 * Routing used to be answered one line at a time — a product lookup, then a category lookup,
 * then a fallback station lookup, for every line of every ticket, on a board that polls every
 * eight seconds. That is the kind of cost nobody notices in a test and everybody notices at
 * dinner service, so it is pinned here: routing is read once per request, not once per line.
 */
class KitchenRoutingPerformanceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'kds-perf.test', 'slug' => 'kp']);

        $this->actingAs(User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]), 'sanctum');
    }

    /** @return array{id: int} a station plus a product routed to it */
    private function stationWithProduct(int $productId, int $sortOrder = 0): KitchenStation
    {
        $station = KitchenStation::query()->create([
            'tenant_id' => $this->tenant->id,
            'name_fa' => 'آشپزخانه '.$sortOrder,
            'slug' => 'kitchen-'.$sortOrder,
            'kind' => KitchenStation::KIND_KITCHEN,
            'is_active' => true,
            'sort_order' => $sortOrder,
        ]);

        StationProduct::query()->create([
            'station_id' => $station->id,
            'product_id' => $productId,
        ]);

        return $station;
    }

    public function test_routing_is_read_once_for_many_lines(): void
    {
        $station = $this->stationWithProduct(1001);

        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'number' => 'KDS-1',
            'status' => 'paid',
            'currency' => 'IRT',
            'subtotal_minor' => 0,
            'total_minor' => 0,
        ]);

        $items = [];
        for ($i = 0; $i < 40; $i++) {
            $items[] = OrderItem::query()->create([
                'tenant_id' => $this->tenant->id,
                'order_id' => $order->id,
                'product_id' => 1001,
                'product_name' => 'آیتم '.$i,
                'quantity' => 1,
                'unit_price_minor' => 1000,
            ]);
        }

        $service = new KitchenStations();

        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        foreach ($items as $item) {
            $stations = $service->stationsForItem((int) $this->tenant->id, $item->load('product:id,category_id'));

            $this->assertSame([$station->id], $stations, 'the product row still routes to its station');
        }

        // Two reads — the routing rows and the active stations — whatever the line count. The
        // bound is a ceiling, not an exact number, so an extra eager-load does not fail the test.
        $this->assertLessThanOrEqual(3, $queries, "routing ran {$queries} queries for 40 lines");
    }

    /** An inactive station must not collect tickets nobody is cooking. */
    public function test_an_inactive_station_is_skipped(): void
    {
        $station = $this->stationWithProduct(2002);
        $station->forceFill(['is_active' => false])->save();

        $fallback = KitchenStation::query()->create([
            'tenant_id' => $this->tenant->id,
            'name_fa' => 'پَس',
            'slug' => 'pass',
            'kind' => KitchenStation::KIND_KITCHEN,
            'is_active' => true,
            'sort_order' => 9,
        ]);

        $item = new OrderItem(['product_id' => 2002]);
        $item->setRelation('product', null);

        $this->assertSame(
            [$fallback->id],
            (new KitchenStations())->stationsForItem((int) $this->tenant->id, $item),
        );
    }
}
