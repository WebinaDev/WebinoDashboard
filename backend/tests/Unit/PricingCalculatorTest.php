<?php

namespace Tests\Unit;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Services\Pricing\PricingCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PricingCalculatorTest extends TestCase
{
    use RefreshDatabase;

    /** @param array<string, mixed> $overrides */
    protected function calc(array $overrides = []): PricingCalculator
    {
        return new PricingCalculator(array_replace_recursive([
            'general' => ['exchange_rate_enabled' => true, 'purchase_currency' => 'base', 'exchange_rate' => 50000],
            'retail' => ['profit_percent' => 20, 'round_enabled' => true, 'round_to' => 1000],
            'credit' => ['enabled' => true, 'increase_percent' => 10],
            'installment' => ['enabled' => true, 'round_enabled' => true, 'round_to' => 1000, 'plans' => [['months' => 3, 'interest' => 15]]],
            'wholesale' => ['enabled' => true, 'discount_percent' => 10],
        ], $overrides));
    }

    public function test_fx_applies_only_for_base_purchase_currency(): void
    {
        $this->assertSame(600000.0, $this->calc()->calculate(10, 'retail'));

        $display = $this->calc(['general' => ['purchase_currency' => 'display'], 'retail' => ['round_enabled' => false]]);
        $this->assertEqualsWithDelta(12.0, $display->calculate(10, 'retail'), 0.0001);

        $off = $this->calc(['general' => ['exchange_rate_enabled' => false], 'retail' => ['round_enabled' => false]]);
        $this->assertEqualsWithDelta(12.0, $off->calculate(10, 'retail'), 0.0001);
    }

    public function test_legacy_purchase_currency_is_treated_as_display(): void
    {
        $calc = new PricingCalculator(['general' => ['exchange_rate_enabled' => true, 'exchange_rate' => 5, 'purchase_currency' => 'irr']]);

        $this->assertSame('display', $calc->section('general')['purchase_currency']);
        $this->assertSame(120000.0, $calc->calculate(100000, 'retail'));
    }

    public function test_credit_uses_rounded_retail_and_retail_rounding(): void
    {
        $this->assertSame(660000.0, $this->calc()->calculate(10, 'credit'));
        $this->assertSame(600000.0, $this->calc(['credit' => ['enabled' => false]])->calculate(10, 'credit'));
    }

    public function test_installment_uses_matching_plan(): void
    {
        $calc = $this->calc();
        $this->assertSame(230000.0, $calc->calculate(10, 'installment', ['months' => 3]));
        $this->assertSame(600000.0, $calc->calculate(10, 'installment', ['months' => 12]));
        $this->assertSame(3, $calc->defaultInstallmentMonths());

        $table = $calc->installmentTable(10);
        $this->assertSame([['months' => 3, 'interest' => 15.0, 'monthly' => 230000.0, 'total' => 690000.0]], $table);
    }

    public function test_wholesale_discounts_fx_price_with_product_category_global_priority(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T', 'slug' => 't', 'domain' => 't.test', 'license_key' => 'k', 'default_currency' => 'IRR',
        ]);
        $cat = Category::query()->create(['tenant_id' => $tenant->id, 'name' => 'Cat', 'slug' => 'cat']);
        $calc = $this->calc(['wholesale' => ['category_rules' => [$cat->id => 30]]]);

        $this->assertSame(450000.0, $calc->calculate(10, 'wholesale'));

        $inCategory = Product::query()->create([
            'tenant_id' => $tenant->id, 'name' => 'A', 'slug' => 'a', 'price_minor' => 1, 'currency' => 'IRR', 'category_id' => $cat->id,
        ]);
        $this->assertSame(350000.0, $calc->calculate(10, 'wholesale', [], $inCategory));

        $inCategory->forceFill(['wholesale_rule' => ['discount_percent' => 20]])->save();
        $this->assertSame(400000.0, $calc->calculate(10, 'wholesale', [], $inCategory->fresh()));

        $variant = ProductVariant::query()->create([
            'tenant_id' => $tenant->id, 'product_id' => $inCategory->id, 'name' => 'V', 'price_minor' => 1,
        ]);
        $this->assertSame(400000.0, $calc->calculate(10, 'wholesale', [], $variant->fresh()));

        $capped = $this->calc(['wholesale' => ['discount_percent' => 150], 'retail' => ['round_enabled' => false]]);
        $this->assertEqualsWithDelta(50.0, $capped->calculate(10, 'wholesale'), 0.01);
        $this->assertSame(500000.0, $this->calc(['wholesale' => ['enabled' => false]])->calculate(10, 'wholesale'));
    }

    public function test_channel_price_respects_lock_enabled_and_feed_mode(): void
    {
        $calc = $this->calc(['platforms' => [
            'digikala' => ['enabled' => true, 'price_mode' => 'markup', 'profit_percent' => 10, 'extra_percent' => 0, 'round_to' => 1000],
            'torob' => ['enabled' => true, 'price_mode' => 'retail', 'profit_percent' => 50],
            'emalls' => ['enabled' => true, 'price_mode' => 'markup', 'profit_percent' => 10, 'extra_percent' => 10, 'round_to' => 1000],
        ]]);

        $this->assertSame(660000.0, $calc->channel(10, 'digikala'));
        $this->assertSame(600000.0, $calc->channel(10, 'torob'));
        $this->assertSame(726000.0, $calc->channel(10, 'emalls'));
        $this->assertSame(600000.0, $calc->channel(10, 'snappshop'));

        $product = new Product(['platform_prices' => ['digikala' => ['lock' => true, 'price' => 555000]]]);
        $this->assertSame(555000.0, $calc->channel(10, 'digikala', $product));

        $unlocked = new Product(['platform_prices' => ['digikala' => ['lock' => false, 'price' => 555000]]]);
        $this->assertSame(660000.0, $calc->channel(10, 'digikala', $unlocked));
    }

    public function test_unit_price_per_purchase_type(): void
    {
        $calc = $this->calc(['general' => ['exchange_rate_enabled' => false]]);
        $product = new Product(['price_minor' => 130000, 'purchase_price_minor' => 100000]);

        $this->assertSame(130000, $calc->unitPrice($product, null, 'cash'));
        $this->assertSame(132000, $calc->unitPrice($product, null, 'credit'));
        $this->assertSame(138000, $calc->unitPrice($product, null, 'installment', 3));
        $this->assertSame(90000, $calc->unitPrice($product, null, 'wholesale'));

        $noPurchase = new Product(['price_minor' => 50000]);
        $this->assertSame(50000, $calc->unitPrice($noPurchase, null, 'credit'));

        $this->assertSame('cash', $this->calc(['credit' => ['enabled' => false]])->normalizePurchaseType('credit'));
        $this->assertSame(['digipay'], $this->calc(['credit' => ['gateways' => ['digipay']]])->gatewaysFor('credit'));
        $this->assertTrue($calc->gatewayAllowed('cash', 'zarinpal'));
    }
}
