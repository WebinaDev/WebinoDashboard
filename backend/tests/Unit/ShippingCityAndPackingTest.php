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
