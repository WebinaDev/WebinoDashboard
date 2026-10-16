<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Services\Coupons\OfferTemplates;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class OfferTemplatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_from_template_is_idempotent(): void
    {
        $tenant = \App\Models\Tenant::query()->create(['name' => 'O', 'slug' => 'of-shop', 'domain' => 'of.test', 'license_key' => 'l-of', 'setup_completed' => true]);
        $a = OfferTemplates::createFor($tenant->id, 'freeship_order1');
        $b = OfferTemplates::createFor($tenant->id, 'freeship_order1');
        $this->assertSame($a->id, $b->id);
        $this->assertTrue((bool) $a->auto_apply);
        $this->assertSame('order_nth', $a->condition_type);
        $this->assertNull(OfferTemplates::createFor($tenant->id, 'nope'));
        $this->assertSame(1, Coupon::query()->where('tenant_id', $tenant->id)->count());
    }
}
