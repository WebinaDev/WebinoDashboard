<?php

namespace Tests\Feature;

use App\Models\ModuleSetting;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Orders\OrderDocumentSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderDocumentsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop', 'slug' => 'shop', 'domain' => 'shop.test', 'license_key' => 'k',
            'setup_completed' => true, 'store_display_name' => 'فروشگاه نمونه', 'default_currency' => 'IRR',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.orders' => true,
            'commerce.pos' => true,
            'commerce.catalog' => true,
        ]);
        $user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($user, 'sanctum');
    }

    protected function order(array $attrs = []): Order
    {
        static $n = 1000;
        $n++;
        $order = Order::query()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'number' => 'WD-'.$n,
            'status' => 'processing',
            'subtotal_minor' => 264000,
            'discount_minor' => 4000,
            'shipping_minor' => 50000,
            'total_minor' => 310000,
            'currency' => 'IRR',
            'payment_provider' => 'zarinpal',
            'customer_name' => 'علی رضایی',
            'customer_phone' => '09120000000',
            'shipping_address' => json_encode([
                'first_name' => 'علی', 'last_name' => 'رضایی', 'state' => 'THR', 'city' => 'تهران',
                'address' => 'خیابان آزادی', 'postcode' => '1234567890', 'phone' => '09121111111',
            ], JSON_UNESCAPED_UNICODE),
            'meta' => ['shipping_title' => 'پست پیشتاز'],
        ], $attrs));
        $order->items()->create([
            'product_name' => 'قهوه اسپرسو', 'sku' => 'ESP-1', 'quantity' => 2, 'unit_price_minor' => 132000, 'purchase_type' => 'credit',
        ]);

        return $order;
    }

    public function test_settings_defaults_legacy_mapping_and_sanitize(): void
    {
        ModuleSetting::query()->create([
            'tenant_id' => $this->tenant->id, 'module_slug' => 'settings', 'submodule_slug' => 'shop.invoices',
            'payload' => ['company_name' => 'شرکت قدیمی', 'phone' => '021-1', 'footer_note' => 'ممنون', 'show_logo' => true],
        ]);

        $s = $this->getJson('/api/v1/settings/shop/invoices?locale=fa')->assertOk()->json('data');
        $this->assertSame('شرکت قدیمی', $s['sender_name']);
        $this->assertSame('021-1', $s['sender_phone']);
        $this->assertSame('ممنون', $s['invoice_thanks']);
        $this->assertSame('فروشگاه نمونه', $s['store_name']);
        $this->assertSame('shop.test', $s['footer_site']);
        $this->assertSame('محل الصاق برچسب پستی', $s['label_postman_title']);
        $this->assertArrayNotHasKey('company_name', $s);
        $this->assertSame('Place for attaching postal label', $this->getJson('/api/v1/settings/shop/invoices?locale=en')->json('data.label_postman_title'));

        $saved = $this->putJson('/api/v1/settings/shop/invoices', ['payload' => [
            'invoice_theme' => 'neon',
            'label_size' => '100x100',
            'accent_color' => 'red',
            'invoice_logo_url' => 'javascript:alert(1)',
            'receipt_logo_url' => 'https://cdn.test/logo.png',
            'enable_receipt' => false,
            'sender_address' => "<b>تهران</b>\nپلاک ۱",
            'unknown_key' => 'x',
        ]])->assertOk()->json('data');

        $this->assertSame('classic', $saved['invoice_theme']);
        $this->assertSame('100x100', $saved['label_size']);
        $this->assertSame('#e775ae', $saved['accent_color']);
        $this->assertSame('', $saved['invoice_logo_url']);
        $this->assertSame('https://cdn.test/logo.png', $saved['receipt_logo_url']);
        $this->assertFalse($saved['enable_receipt']);
        $this->assertSame("تهران\nپلاک ۱", $saved['sender_address']);
        $this->assertSame('شرکت قدیمی', $saved['sender_name']);
        $this->assertArrayNotHasKey('unknown_key', $saved);
    }

    public function test_invoice_contains_parties_items_totals_and_barcode(): void
    {
        OrderDocumentSettings::save($this->tenant->id, ['sender_phone' => '02188888888', 'invoice_theme' => 'band']);
        $order = $this->order();

        $res = $this->getJson("/api/v1/orders/{$order->id}/print?type=invoice&locale=fa", ['Origin' => 'https://shop.test'])
            ->assertOk()
            ->assertJsonPath('data.type', 'invoice');
        $html = $res->json('data.html');

        $this->assertStringContainsString('dir="rtl"', $html);
        $this->assertStringContainsString('theme-band', $html);
        $this->assertStringContainsString('فاکتور فروش', $html);
        $this->assertStringContainsString('سفارش #WD-'.strtr(substr((string) $order->number, 3), ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']), $html);
        $this->assertStringContainsString('علی رضایی', $html);
        $this->assertStringContainsString('تهران', $html);
        $this->assertStringContainsString('۰۲۱۸۸۸۸۸۸۸۸', $html);
        $this->assertStringContainsString('قهوه اسپرسو', $html);
        $this->assertStringContainsString('۱۳۲٬۰۰۰ ریال', $html);
        $this->assertStringContainsString('۲۶۴٬۰۰۰ ریال', $html);
        $this->assertStringContainsString('۳۱۰٬۰۰۰ ریال', $html);
        $this->assertStringContainsString('۴٬۰۰۰ ریال', $html);
        $this->assertStringContainsString('پست پیشتاز', $html);
        $this->assertStringContainsString('زرین‌پال', $html);
        $this->assertStringContainsString('در حال انجام', $html);
        $this->assertStringContainsString('data:image/svg+xml;base64,', $html);
        $this->assertStringContainsString("url('https://shop.test/fonts/yekan-bakh/woff2/YekanBakh-Regular.woff2')", $html);
        $this->assertNull($order->fresh()->printed_at);

        $en = $this->getJson("/api/v1/orders/{$order->id}/print?type=invoice&locale=en")->json('data.html');
        $this->assertStringContainsString('dir="ltr"', $en);
        $this->assertStringContainsString('310,000 Rial', $en);
        $this->assertStringContainsString('Tehran', $en);
    }

    public function test_every_order_document_renders_and_disabled_types_are_rejected(): void
    {
        OrderDocumentSettings::save($this->tenant->id, ['label_theme' => 'iran', 'enable_store_label' => false]);
        $order = $this->order(['customer_note' => 'زنگ نزنید']);

        foreach (['receipt' => 'رسید', 'label' => 'برچسب پستی', 'packing' => 'زنگ نزنید', 'customer_label' => 'برچسب مشتری'] as $type => $needle) {
            $html = $this->getJson("/api/v1/orders/{$order->id}/print?type={$type}")->assertOk()->json('data.html');
            $this->assertStringContainsString($needle, $html, $type);
            $this->assertStringContainsString('WD-', $html, $type);
        }
        $label = $this->getJson("/api/v1/orders/{$order->id}/print?type=label")->json('data.html');
        $this->assertStringContainsString('pc-box', $label);
        $this->assertStringContainsString('محل الصاق برچسب پستی', $label);

        $this->getJson("/api/v1/orders/{$order->id}/print?type=store_label")->assertStatus(400);
        $this->getJson("/api/v1/orders/{$order->id}/print?type=bogus")->assertStatus(400);
        $this->assertNotNull($order->fresh()->printed_at);
    }

    public function test_pos_receipt_still_marks_printed_and_other_tenants_are_hidden(): void
    {
        $order = $this->order();
        $this->getJson("/api/v1/pos/orders/{$order->id}/print")->assertOk()->assertJsonPath('data.type', 'receipt');
        $this->assertNotNull($order->fresh()->printed_at);

        $other = Tenant::query()->create(['name' => 'O', 'slug' => 'o', 'domain' => 'o.test', 'license_key' => 'k2', 'setup_completed' => true]);
        $foreign = $this->order(['tenant_id' => $other->id]);
        $this->getJson("/api/v1/orders/{$foreign->id}/print?type=invoice")->assertNotFound();
    }

    public function test_batch_labels_only_include_unprinted_orders_and_mark_them(): void
    {
        $a = $this->order();
        $b = $this->order(['status' => 'paid']);
        $this->order(['status' => 'pending_payment']);
        $this->order(['meta' => ['shipping_label_printed_at' => now()->toIso8601String()]]);
        $this->getJson("/api/v1/orders/{$a->id}/print?type=label")->assertOk();

        $res = $this->getJson('/api/v1/orders/print-labels')->assertOk()->json('data');
        $this->assertSame(1, $res['count']);
        $this->assertSame([$b->id], $res['order_ids']);
        $this->assertSame(1, substr_count($res['html'], 'postal-label-container label-page'));
        $this->assertNotEmpty($b->fresh()->meta['shipping_label_printed_at'] ?? null);

        $this->getJson('/api/v1/orders/print-labels')->assertOk()->assertJsonPath('data.count', 0);

        OrderDocumentSettings::save($this->tenant->id, ['enable_label' => false]);
        $this->getJson('/api/v1/orders/print-labels')->assertStatus(400);
    }

    public function test_product_labels_split_variations(): void
    {
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'تیشرت', 'slug' => 'tee', 'sku' => 'TEE',
            'price_minor' => 500000, 'currency' => 'IRR', 'status' => 'publish',
        ]);
        foreach (['S', 'M'] as $size) {
            ProductVariant::query()->create([
                'tenant_id' => $this->tenant->id, 'product_id' => $product->id, 'name' => $size,
                'sku' => 'TEE-'.$size, 'price_minor' => 510000,
            ]);
        }
        $simple = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'ماگ', 'slug' => 'mug', 'price_minor' => 90000, 'currency' => 'IRR', 'status' => 'publish',
        ]);

        $html = $this->getJson("/api/v1/shop/products/print-labels?ids={$product->id},{$simple->id}")->assertOk()->json('data.html');
        $this->assertSame(3, substr_count($html, 'class="wh-label"'));
        $this->assertStringContainsString('تیشرت - S', $html);
        $this->assertStringContainsString('TEE-M', $html);
        $this->assertStringContainsString('۵۱۰٬۰۰۰ ریال', $html);
        $this->assertStringContainsString('size: 58mm 40mm', $html);

        OrderDocumentSettings::save($this->tenant->id, ['product_label_split_variations' => false, 'product_label_size' => '80x50']);
        $html = $this->getJson("/api/v1/shop/products/print-labels?ids={$product->id}")->json('data.html');
        $this->assertSame(1, substr_count($html, 'class="wh-label"'));
        $this->assertStringContainsString('size: 80mm 50mm', $html);

        $this->getJson('/api/v1/shop/products/print-labels?ids=999999')->assertNotFound();
    }
}
