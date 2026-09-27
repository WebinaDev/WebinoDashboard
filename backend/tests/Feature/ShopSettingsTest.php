<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.inventory' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_general_save_sanitizes_address_and_currency(): void
    {
        $res = $this->putJson('/api/v1/settings/shop/general', [
            'payload' => [
                'store_display_name' => '  My Store  ',
                'store_address' => [
                    'address_1' => 'Valiasr',
                    'address_2' => 'No 12',
                    'city' => 'Tehran',
                    'country' => 'IR',
                    'state' => 'Tehran',
                    'postcode' => '12345',
                ],
                'selling_locations' => 'specific',
                'specific_allowed_countries' => ['IR', 'AE'],
                'currency' => 'irt',
                'currency_position' => 'right_space',
                'thousand_separator' => ',',
                'decimal_separator' => '.',
                'price_decimals' => 0,
                'enable_coupons' => true,
                'calc_taxes' => true,
            ],
        ])->assertOk()->json('data');

        $this->assertSame('My Store', $res['store_display_name']);
        $this->assertSame('IR', $res['store_address']['country']);
        $this->assertSame('Valiasr', $res['store_address']['address_1']);
        $this->assertSame('IRT', $res['currency']);
        $this->assertSame('right_space', $res['currency_position']);
        $this->assertSame(['IR', 'AE'], $res['specific_allowed_countries']);

        $this->assertSame('IRT', $this->tenant->fresh()->default_currency);
        $this->assertSame('My Store', $this->tenant->fresh()->store_display_name);

        $loaded = $this->getJson('/api/v1/settings/shop/general')->assertOk()->json('data');
        $this->assertSame('My Store', $loaded['store_display_name']);
        $this->assertSame('IRT', $loaded['currency']);
    }

    public function test_invalid_country_is_rejected(): void
    {
        $this->putJson('/api/v1/settings/shop/general', [
            'payload' => [
                'store_address' => [
                    'country' => 'ZZ',
                ],
            ],
        ])->assertStatus(422);
    }

    public function test_inventory_summary_uses_saved_low_stock_threshold(): void
    {
        ShopSettings::saveProducts($this->tenant->id, [
            'low_stock_threshold' => 5,
            'manage_stock' => true,
        ]);

        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Low',
            'slug' => 'low',
            'price_minor' => 1000,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 3,
            'stock_status' => 'instock',
            'manage_stock' => true,
            'is_available' => true,
            'is_hidden' => false,
        ]);
        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Ok',
            'slug' => 'ok',
            'price_minor' => 1000,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 20,
            'stock_status' => 'instock',
            'manage_stock' => true,
            'is_available' => true,
            'is_hidden' => false,
        ]);

        $data = $this->getJson('/api/v1/inventory/summary')->assertOk()->json('data');
        $this->assertSame(5, $data['low_stock_threshold']);
        $names = collect($data['low_stock_products'])->pluck('name')->all();
        $this->assertContains('Low', $names);
        $this->assertNotContains('Ok', $names);
    }

    public function test_hide_out_of_stock_filters_public_catalog(): void
    {
        ShopSettings::saveProducts($this->tenant->id, [
            'hide_out_of_stock' => true,
        ]);
        ShopSettings::saveGeneral($this->tenant->id, [
            'currency' => 'IRT',
            'thousand_separator' => ',',
            'price_decimals' => 0,
        ]);

        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'In Stock',
            'slug' => 'in-stock',
            'price_minor' => 10000,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
        ]);
        Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Gone',
            'slug' => 'gone',
            'price_minor' => 10000,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 0,
            'stock_status' => 'outofstock',
            'is_available' => true,
            'is_hidden' => false,
        ]);

        $data = $this->getJson('/api/v1/public/catalog', [
            'X-Tenant-Domain' => 'shop.test',
        ])->assertOk()->json('data');

        $names = collect($data['items'])->pluck('name')->all();
        $this->assertContains('In Stock', $names);
        $this->assertNotContains('Gone', $names);
        $this->assertSame('IRT', $data['currency_display']['currency']);
    }

    public function test_format_price_uses_separators(): void
    {
        $formatted = ShopSettings::formatPrice(1234567.5, [
            'currency' => 'IRT',
            'currency_position' => 'left_space',
            'thousand_separator' => ',',
            'decimal_separator' => '.',
            'price_decimals' => 1,
        ]);
        $this->assertSame('IRT 1,234,567.5', $formatted);
    }
}
