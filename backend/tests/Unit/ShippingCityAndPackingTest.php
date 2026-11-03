<?php

namespace Tests\Unit;

use App\Models\Product;
use App\Models\Tenant;
use App\Services\Shipping\BoxPacker;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShippingCityAndPackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_box_packer_picks_smallest_fitting_boxes(): void
    {
        $p = new Product(['length' => 20, 'width' => 10, 'height' => 10, 'weight' => 400]);
        $lines = [(object) ['product' => $p, 'quantity' => 3]];
        $res = BoxPacker::pack($lines, ['enabled' => true, 'boxes' => [
            ['name' => 'کوچک', 'length' => 20, 'width' => 20, 'height' => 10, 'max_weight_g' => 1000, 'cost' => 5000],
            ['name' => 'بزرگ', 'length' => 40, 'width' => 30, 'height' => 20, 'max_weight_g' => 10000, 'cost' => 12000],
        ]]);
        $this->assertNotNull($res);
        // 3 items × 2000cm³: small box holds 2 (4000cm³, 800g) → 2 small boxes.
        $this->assertCount(2, $res['boxes']);
        $this->assertSame(10000, $res['cost_minor']);
        $this->assertNull(BoxPacker::pack($lines, ['enabled' => false, 'boxes' => []]));
    }

    public function test_packaging_extras_and_envelopes(): void
    {
        $p = new Product(['length' => 20, 'width' => 15, 'height' => 1, 'weight' => 100]);
        $lines = [(object) ['product' => $p, 'quantity' => 1]];
        $res = BoxPacker::pack($lines, [
            'enabled' => true,
            'fixed_cost' => 2000,
            'tape_enabled' => true,
            'tape_cost' => 500,
            'bubble_wrap_enabled' => true,
            'bubble_wrap_cost' => 1500,
            'boxes' => [],
            'envelopes' => [
                ['name' => 'A4', 'length' => 32, 'width' => 23, 'height' => 2, 'max_weight_g' => 500, 'cost' => 4000, 'kind' => 'envelope'],
            ],
        ]);
        $this->assertNotNull($res);
        $this->assertSame('A4', $res['boxes'][0]['name']);
        // envelope 4000 + fixed 2000 + tape 500 + bubble 1500
        $this->assertSame(8000, $res['cost_minor']);
    }

    public function test_free_shipping_only_mode(): void
    {
        $tenant = Tenant::query()->create(['name' => 'F', 'slug' => 'f-ship', 'domain' => 'f.test', 'license_key' => 'l-f', 'setup_completed' => true]);
        $svc = app(ShippingZonesService::class);
        $zone = $svc->createZone($tenant->id, 'IR');
        $flat = $svc->addMethod($tenant->id, (int) $zone['id'], 'flat_rate');
        $svc->updateMethod($tenant->id, (int) $zone['id'], (int) $flat['instance_id'], ['settings' => ['cost' => 10000]]);
        $free = $svc->addMethod($tenant->id, (int) $zone['id'], 'free_shipping');
        $svc->updateMethod($tenant->id, (int) $zone['id'], (int) $free['instance_id'], ['settings' => ['min_amount' => 0]]);
        $svc->saveGlobal($tenant->id, ['enable_shipping' => true, 'free_shipping_only' => true]);

        $rates = $svc->quote($tenant->id, null, null, 50000);
        $this->assertCount(1, $rates);
        $this->assertSame('free_shipping', $rates[0]['method_id']);
    }

    public function test_flat_city_rates_and_region_cities(): void
    {
        $tenant = Tenant::query()->create(['name' => 'S', 'slug' => 's-ship', 'domain' => 's.test', 'license_key' => 'l-s', 'setup_completed' => true]);
        $svc = app(ShippingZonesService::class);
        $zone = $svc->createZone($tenant->id, 'تهران');
        $svc->updateZone($tenant->id, (int) $zone['id'], ['locations' => [['type' => 'state', 'code' => 'IR:TE']]]);
        $m = $svc->addMethod($tenant->id, (int) $zone['id'], 'flat_city');
        $svc->updateMethod($tenant->id, (int) $zone['id'], (int) $m['instance_id'], ['settings' => [
            'city_rates' => [['city' => 'تهران', 'cost' => 45000], ['city' => 'شهریار', 'cost' => 70000]],
            'other_cities' => 'hide',
        ]]);

        $this->assertSame(['تهران', 'شهریار'], $svc->citiesFor($tenant->id, 'IR:TE'));
        $this->assertSame(45000, $svc->quote($tenant->id, 'IR:TE', null, 100000, 'تهران')[0]['cost_minor']);
        $this->assertSame(70000, $svc->quote($tenant->id, 'IR:TE', null, 100000, 'شهريار')[0]['cost_minor']); // Arabic yeh normalised
        $this->assertSame([], $svc->quote($tenant->id, 'IR:TE', null, 100000, 'کرج'));
    }
}
