<?php

namespace Tests\Concerns;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Marketplace\Basalam\BasalamEndpoints;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Support\Facades\Cache;

/** Shared Basalam fixtures: tenant/admin user, connected credentials, product and invoice payloads. */
trait BasalamTestHelpers
{
    protected Tenant $tenant;

    protected function shopUser(): User
    {
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'localhost',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Shop',
            'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true,
            'commerce.orders' => true,
            'commerce.variants' => true,
            'commerce.pricing' => true,
            'commerce.marketplace' => true,
            'commerce.payments' => true,
        ]);

        /** @var User $user */
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);

        return $user;
    }

    protected function settings(): MarketplaceSettingsService
    {
        return app(MarketplaceSettingsService::class);
    }

    protected function connect(array $credentials = []): void
    {
        $this->settings()->save($this->tenant->id, 'basalam', [
            'enabled' => true,
            'credentials' => array_merge([
                'access_token' => 'AT',
                'refresh_token' => 'RT',
                'vendor_id' => '77',
                'webhook_token' => 'whtok',
            ], $credentials),
        ]);
        $this->settings()->putState($this->tenant->id, 'basalam', ['expires_at' => time() + 86400, 'is_vendor' => true]);
        Cache::flush();
    }

    protected function product(array $attrs = []): Product
    {
        return Product::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Handmade bag',
            'slug' => 'bag',
            'sku' => 'BAG-1',
            'price_minor' => 250_000,
            'currency' => 'IRT',
            'stock' => 4,
            'manage_stock' => true,
            'status' => 'publish',
            'type' => 'simple',
            'weight' => 500,
            'description' => 'A handmade leather bag.',
            'meta' => ['marketplace' => ['basalam' => ['category_ids' => [10, 20, 30], 'preparation_days' => 2]]],
        ], $attrs));
    }

    /** @return array<string, mixed> */
    protected function invoice(int $id = 5001, int $statusId = BasalamEndpoints::STATUS_WAIT_VENDOR): array
    {
        return [
            'id' => $id,
            'hash_id' => 'H'.$id,
            'status' => ['id' => $statusId],
            'items' => [[
                'id' => 1,
                'quantity' => 2,
                'product' => ['id' => 9001, 'title' => 'Handmade bag', 'price' => 2_500_000],
                'financial_report' => ['report_items' => [['title' => 'قیمت محصول', 'amount' => 5_000_000]]],
            ]],
            'customer_data' => [
                'recipient' => ['name' => 'Ali Rezaei', 'mobile' => '09120000000', 'postal_address' => 'Tehran', 'postal_code' => '1234567890'],
                'city' => ['id' => 1, 'title' => 'Tehran', 'parent' => ['id' => 2, 'title' => 'Tehran']],
            ],
            'financial_report' => ['shipping_submit' => ['total' => ['amount' => 300_000]]],
        ];
    }
}
