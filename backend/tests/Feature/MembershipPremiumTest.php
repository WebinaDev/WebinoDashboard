<?php

namespace Tests\Feature;

use App\Models\Membership\MembershipDownload;
use App\Models\Membership\MembershipGrant;
use App\Models\Membership\MembershipPlan;
use App\Models\Order;
use App\Models\Poetry\PoetryBook;
use App\Models\Poetry\PoetryHighlight;
use App\Models\Poetry\PoetryMedia;
use App\Models\Poetry\PoetryPoem;
use App\Models\Product;
use App\Models\SupportKbArticle;
use App\Models\SupportKbCategory;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Membership\MembershipService;
use App\Services\Membership\MembershipSettings;
use App\Services\Orders\OrderStatusService;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Poetry\PoetryScope;
use App\Services\Poetry\PoetryTaxonomy;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Premium membership: plans sold through the shop, grants and extension, premium content lock,
 * download quota, member discount, comparison rows, and the public FAQ (knowledge base) hub.
 */
class MembershipPremiumTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected User $customer;

    protected array $h;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = $this->createTenant(['domain' => 'poet.test', 'slug' => 'poet', 'default_currency' => 'IRT']);
        $this->enableSubmodules($this->tenant->id, [
            'commerce.catalog' => true, 'commerce.cart' => true, 'commerce.checkout' => true, 'commerce.orders' => true,
        ]);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer', 'phone' => '09120000000']);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        PoetryTaxonomy::ensure($this->tenant->id);
        PoetryScope::set($this->tenant->id);

        $ship = app(ShippingZonesService::class);
        $cfg = $ship->defaults();
        $cfg['zones'] = [[
            'id' => 1, 'name' => 'ایران', 'order' => 0, 'locations' => [['type' => 'country', 'code' => 'IR']],
            'methods' => [['instance_id' => 1, 'method_id' => 'flat_rate', 'title' => 'پست', 'enabled' => true, 'settings' => ['cost' => 50000, 'original_method_id' => 'flat_rate']]],
        ]];
        $cfg['next_zone_id'] = 2;
        $cfg['next_method_id'] = 2;
        $ship->putConfig($this->tenant->id, $cfg);
        app(PaymentGatewaySettingsService::class)->setGatewayEnabled($this->tenant->id, 'cod', true);
    }

    protected function tearDown(): void
    {
        PoetryScope::set(null);
        parent::tearDown();
    }

    protected function plan(array $extra = []): array
    {
        $this->actingAs($this->admin, 'sanctum');

        return $this->postJson('/api/v1/membership/plans', array_merge(['name' => 'یک ماهه', 'duration_value' => 1, 'duration_unit' => 'month', 'price_minor' => 189000], $extra), $this->h)
            ->assertCreated()->json('data');
    }

    protected function payOrder(int $orderId): void
    {
        app(OrderStatusService::class)->apply(Order::query()->findOrFail($orderId), 'paid', ['amount_paid_minor' => 1]);
    }

    protected function buy(int $productId, int $qty = 1): array
    {
        $this->actingAs($this->customer->fresh(), 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $productId, 'quantity' => $qty], $this->h)->assertOk();

        return $this->postJson('/api/v1/checkout', [], $this->h)->assertCreated()->json('data');
    }

    public function test_admin_plan_crud_creates_hidden_virtual_product_and_nothing_is_seeded(): void
    {
        $this->assertSame(0, MembershipPlan::query()->count());
        $plan = $this->plan(['sale_price_minor' => 150000, 'badge' => 'پیشنهاد ویژه']);
        $this->assertSame('یک ماهه', $plan['name']);
        $this->assertSame(150000, $plan['price_minor']);
        $this->assertSame(189000, $plan['regular_price_minor']);
        $this->assertTrue($plan['on_sale']);
        $product = Product::query()->findOrFail($plan['product_id']);
        $this->assertSame('hidden', $product->catalog_visibility);
        $this->assertTrue((bool) $product->meta['virtual']);
        $this->assertSame(150000, (int) $product->sale_price_minor);

        $this->putJson('/api/v1/membership/plans/'.$plan['id'], ['price_minor' => 199000, 'sale_price_minor' => null], $this->h)->assertOk()
            ->assertJsonPath('data.price_minor', 199000);
        $this->assertSame(199000, (int) $product->fresh()->price_minor);
        $this->postJson('/api/v1/membership/plans', ['name' => 'بد', 'duration_value' => 0, 'duration_unit' => 'week', 'price_minor' => 1], $this->h)
            ->assertStatus(422)->assertJsonValidationErrors(['duration_value', 'duration_unit']);

        // Plans are not listed in the shop catalog.
        $this->getJson('/api/v1/public/catalog', $this->h)->assertOk()->assertJsonMissing(['id' => $product->id, 'slug' => $product->slug]);

        // Customers cannot manage plans.
        $this->actingAs($this->customer, 'sanctum');
        $this->getJson('/api/v1/membership/plans', $this->h)->assertForbidden();

        $this->actingAs($this->admin, 'sanctum');
        $this->deleteJson('/api/v1/membership/plans/'.$plan['id'], [], $this->h)->assertOk();
        $this->assertSame('draft', $product->fresh()->status);
    }

    public function test_buying_a_plan_activates_extends_and_refund_revokes(): void
    {
        $plan = $this->plan(['duration_value' => 3, 'price_minor' => 299000]);
        // Stepped checkout: a plan-only cart needs no address or shipping.
        $this->actingAs($this->customer->fresh(), 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $plan['product_id']], $this->h)->assertOk()->assertJsonPath('data.requires_shipping', false);
        $step = $this->postJson('/api/v1/checkout/steps/address', [], $this->h)->assertOk()->json('data');
        $this->assertTrue($step['valid']);
        $this->assertFalse($step['totals']['requires_shipping']);
        $this->assertSame([], $step['totals']['shipping_rates']);
        $this->deleteJson('/api/v1/cart/items/'.$plan['product_id'], [], $this->h)->assertOk();
        $order = $this->buy($plan['product_id']);
        // Virtual only: no shipping, no address needed.
        $this->assertSame(0, (int) $order['shipping_minor']);
        $this->assertSame(299000, (int) $order['total_minor']);
        $this->assertFalse(app(MembershipService::class)->isPremium($this->customer->fresh()));

        $this->payOrder($order['id']);
        $until = $this->customer->fresh()->premium_until;
        $this->assertNotNull($until);
        $this->assertEqualsWithDelta(now()->addMonthsNoOverflow(3)->timestamp, $until->timestamp, 5);
        // Paying the same order again does not grant twice.
        $this->payOrder($order['id']);
        $this->assertSame(1, MembershipGrant::query()->count());

        // A second purchase extends from the current end date.
        $second = $this->buy($plan['product_id']);
        $this->payOrder($second['id']);
        $this->assertEqualsWithDelta(now()->addMonthsNoOverflow(6)->timestamp, $this->customer->fresh()->premium_until->timestamp, 5);

        $this->getJson('/api/v1/account/membership', $this->h)->assertOk()
            ->assertJsonPath('data.is_premium', true)->assertJsonPath('data.plan.id', $plan['id'])
            ->assertJsonPath('data.downloads.audio.unlimited', true);

        // Refunding the first order takes back its period; the second slides back to now.
        app(OrderStatusService::class)->apply(Order::query()->findOrFail($order['id']), 'refunded');
        $this->assertEqualsWithDelta(now()->addMonthsNoOverflow(3)->timestamp, $this->customer->fresh()->premium_until->timestamp, 60);
    }

    public function test_admin_grant_and_revoke_and_member_list(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $res = $this->postJson('/api/v1/membership/members/'.$this->customer->id.'/grants', ['duration_value' => 10, 'duration_unit' => 'day', 'note' => 'هدیه'], $this->h)
            ->assertCreated()->json('data');
        $this->assertTrue($res['member']['is_premium']);
        $this->getJson('/api/v1/membership/members?status=active', $this->h)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $this->customer->id);
        $this->postJson('/api/v1/membership/grants/'.$res['grant']['id'].'/revoke', [], $this->h)->assertOk()->assertJsonPath('data.member.is_premium', false);
        $this->assertNull($this->customer->fresh()->premium_until);
    }

    public function test_premium_poems_and_media_are_locked_for_visitors_and_open_for_members(): void
    {
        $open = PoetryPoem::query()->create(['slug' => 'open', 'title' => 'آزاد', 'excerpt' => 'متن', 'status' => 'published', 'flags' => ['is_short' => true]]);
        $open->stanzas()->create(['position' => 0, 'type' => 'stanza', 'lines' => ['یک', 'دو']]);
        $vip = PoetryPoem::query()->create(['slug' => 'vip', 'title' => 'ویژه', 'excerpt' => 'رمز', 'status' => 'published', 'is_premium' => true, 'flags' => ['is_short' => true]]);
        $vip->stanzas()->create(['position' => 0, 'type' => 'stanza', 'lines' => ['سه', 'چهار']]);
        PoetryMedia::query()->create(['title' => 'صوت آزاد', 'kind' => 'audio', 'file_url' => '/storage/a.mp3']);
        PoetryMedia::query()->create(['title' => 'ویدیو ویژه', 'kind' => 'video', 'file_url' => '/storage/v.mp4', 'is_premium' => true, 'poem_id' => $open->id]);

        // Visitor: titles and meta, no text and no media links.
        $list = collect($this->getJson('/api/v1/public/poetry/poems?flag=is_short&with_text=1', $this->h)->assertOk()->json('data'))->keyBy('slug');
        $this->assertTrue($list['vip']['is_premium']);
        $this->assertTrue($list['vip']['locked']);
        $this->assertSame([], $list['vip']['lines']);
        $this->assertNull($list['vip']['excerpt']);
        $this->assertSame(2, $list['vip']['line_count']);
        $this->assertFalse($list['open']['locked']);
        $this->assertSame(['یک', 'دو'], $list['open']['lines']);
        $show = $this->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk()->json('data');
        $this->assertTrue($show['locked']);
        $this->assertSame([], $show['stanzas']);
        $this->assertSame([], $show['sequence']);
        $this->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertForbidden()->assertJsonPath('data.code', 'premium_required');
        $this->assertCount(0, $this->getJson('/api/v1/public/poetry/poems/open', $this->h)->json('data.media'));
        $media = collect($this->getJson('/api/v1/public/poetry/media', $this->h)->assertOk()->json('data'))->keyBy('title');
        $this->assertTrue($media['ویدیو ویژه']['locked']);
        $this->assertNull($media['ویدیو ویژه']['url']);
        $this->assertSame('/storage/a.mp3', $media['صوت آزاد']['url']);
        $this->assertCount(1, $this->getJson('/api/v1/public/poetry/media?premium=1', $this->h)->json('data'));
        $this->assertCount(1, $this->getJson('/api/v1/public/poetry/poems?premium=1', $this->h)->json('data'));

        // Member: everything.
        app(MembershipService::class)->grant($this->customer, 1, 'month');
        $this->actingAs($this->customer->fresh(), 'sanctum');
        $show = $this->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk()->json('data');
        $this->assertFalse($show['locked']);
        $this->assertSame(['سه', 'چهار'], $show['stanzas'][0]['lines']);
        $this->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertOk();
        $this->assertCount(1, $this->getJson('/api/v1/public/poetry/poems/open', $this->h)->json('data.media'));
        $media = collect($this->getJson('/api/v1/public/poetry/media', $this->h)->json('data'))->keyBy('title');
        $this->assertFalse($media['ویدیو ویژه']['locked']);
        $this->assertSame('/storage/v.mp4', $media['ویدیو ویژه']['url']);

        // Admin flag round trip.
        $this->actingAs($this->admin, 'sanctum');
        $id = $this->postJson('/api/v1/poetry/poems', ['title' => 'تازه', 'status' => 'published', 'is_premium' => true, 'stanzas' => [['type' => 'stanza', 'lines' => ['x']]]], $this->h)
            ->assertCreated()->assertJsonPath('data.is_premium', true)->json('data.id');
        $this->putJson('/api/v1/poetry/poems/'.$id, ['is_premium' => false], $this->h)->assertOk()->assertJsonPath('data.is_premium', false);
        $this->postJson('/api/v1/poetry/media', ['title' => 'م', 'kind' => 'audio', 'file_url' => '/storage/x.mp3', 'is_premium' => true], $this->h)
            ->assertCreated()->assertJsonPath('data.is_premium', true);
    }

    public function test_membership_off_opens_premium_content(): void
    {
        PoetryPoem::query()->create(['slug' => 'vip', 'title' => 'ویژه', 'status' => 'published', 'is_premium' => true]);
        app(MembershipSettings::class)->put($this->tenant->id, ['enabled' => false]);
        $this->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk()->assertJsonPath('data.locked', false);
    }

    public function test_download_quota_for_normal_users_and_unlimited_for_members(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('poetry/a.mp3', 'x');
        app(MembershipSettings::class)->put($this->tenant->id, ['downloads' => ['free_audio' => 2, 'free_video' => 0]]);
        $ids = [];
        foreach (range(1, 3) as $i) {
            $ids[] = PoetryMedia::query()->create(['title' => 'صوت '.$i, 'kind' => 'audio', 'file_url' => '/storage/poetry/a.mp3'])->id;
        }
        $video = PoetryMedia::query()->create(['title' => 'ویدیو', 'kind' => 'video', 'external_url' => 'https://www.aparat.com/v/abc'])->id;
        $vip = PoetryMedia::query()->create(['title' => 'ویژه', 'kind' => 'audio', 'file_url' => '/storage/poetry/a.mp3', 'is_premium' => true])->id;

        $this->getJson('/api/v1/account/membership/media/'.$ids[0].'/download', $this->h)->assertUnauthorized();
        $this->actingAs($this->customer, 'sanctum');
        $this->get('/api/v1/account/membership/media/'.$ids[0].'/download', $this->h)->assertOk()->assertDownload();
        $this->get('/api/v1/account/membership/media/'.$ids[0].'/download', $this->h)->assertOk(); // same item again is free
        $this->getJson('/api/v1/account/membership', $this->h)->assertJsonPath('data.downloads.audio.used', 1)->assertJsonPath('data.downloads.audio.remaining', 1)
            ->assertJsonPath('data.downloads.audio.limit', 2)->assertJsonPath('data.is_premium', false);
        $this->getJson('/api/v1/account/membership/media/'.$ids[1].'/download?mode=json', $this->h)->assertOk()->assertJsonPath('data.remaining', 0);
        $this->getJson('/api/v1/account/membership/media/'.$ids[2].'/download', $this->h)->assertForbidden()->assertJsonPath('data.code', 'download_quota_exceeded');
        $this->getJson('/api/v1/account/membership/media/'.$video.'/download', $this->h)->assertForbidden();
        $this->getJson('/api/v1/account/membership/media/'.$vip.'/download', $this->h)->assertForbidden()->assertJsonPath('data.code', 'premium_required');
        $this->assertSame(2, MembershipDownload::query()->count());

        app(MembershipService::class)->grant($this->customer, 1, 'year');
        $this->actingAs($this->customer->fresh(), 'sanctum');
        $this->get('/api/v1/account/membership/media/'.$ids[2].'/download', $this->h)->assertOk();
        $this->getJson('/api/v1/account/membership/media/'.$video.'/download', $this->h)->assertOk()->assertJsonPath('data.url', 'https://www.aparat.com/v/abc');
        $this->get('/api/v1/account/membership/media/'.$vip.'/download', $this->h)->assertOk();
        $this->getJson('/api/v1/account/membership', $this->h)->assertJsonPath('data.downloads.audio.remaining', null);
    }

    public function test_member_discount_in_cart_quote_and_order_excluding_plans(): void
    {
        $plan = $this->plan();
        $book = Product::query()->create(['tenant_id' => $this->tenant->id, 'name' => 'کتاب', 'slug' => 'book', 'price_minor' => 200000, 'currency' => 'IRT',
            'status' => 'publish', 'is_available' => true, 'is_hidden' => false, 'is_sold_out' => false, 'manage_stock' => false, 'stock_status' => 'instock']);

        // Not a member: no discount line.
        $this->actingAs($this->customer, 'sanctum');
        $this->postJson('/api/v1/cart/items', ['product_id' => $book->id], $this->h)->assertOk()->assertJsonPath('data.membership_discount', null);

        app(MembershipService::class)->grant($this->customer, 1, 'month');
        $this->actingAs($this->customer->fresh(), 'sanctum');
        $cart = $this->postJson('/api/v1/cart/items', ['product_id' => $plan['product_id']], $this->h)->assertOk()->json('data');
        $this->assertSame(20000, $cart['membership_discount']['discount_minor']);
        $this->assertStringContainsString('10', $cart['membership_discount']['label']);
        $this->assertTrue($cart['requires_shipping']);

        $session = $this->getJson('/api/v1/checkout/session', $this->h)->assertOk()->json('data.totals');
        $this->assertSame(20000, $session['membership_discount']['discount_minor']);
        $this->assertSame(20000, $session['discount_minor']);

        $order = $this->postJson('/api/v1/checkout', ['shipping_address' => 'تهران', 'customer_phone' => '09121234567', 'recipient_name' => 'خریدار',
            'address_line' => 'خیابان', 'shipping_instance_id' => 1, 'shipping_state_code' => 'IR:TE', 'shipping_city' => 'تهران'], $this->h)->assertCreated()->json('data');
        $this->assertSame(20000, (int) $order['discount_minor']);
        $this->assertSame(20000, (int) $order['meta']['membership_discount']['discount_minor']);
        $this->assertSame(200000 + 189000 - 20000 + 50000, (int) $order['total_minor']);
    }

    public function test_public_plans_and_comparison_features(): void
    {
        $this->plan(['name' => 'سه ماهه', 'duration_value' => 3, 'price_minor' => 299000, 'sort' => 2]);
        $this->plan(['name' => 'یک ماهه', 'sort' => 1]);
        $this->plan(['name' => 'غیرفعال', 'is_active' => false]);
        $this->putJson('/api/v1/membership/settings', ['discount_percent' => 12, 'features' => [
            ['label' => 'دسترسی به همه اشعار', 'free' => false, 'premium' => true],
            ['label' => 'دانلود صوت', 'free' => '۵ صوت', 'premium' => 'نامحدود'],
            ['label' => ''],
        ]], $this->h)->assertOk()->assertJsonCount(2, 'data.features')->assertJsonPath('data.discount_percent', 12);

        $data = $this->getJson('/api/v1/public/membership', $this->h)->assertOk()->json('data');
        $this->assertSame(['یک ماهه', 'سه ماهه'], array_column($data['plans'], 'name'));
        $this->assertSame('۳ ماهه', strtr($data['plans'][1]['duration_label'], ['3' => '۳']));
        $this->assertSame('دانلود صوت', $data['features'][1]['label']);
        $this->assertSame('۵ صوت', $data['features'][1]['free']);
        $this->assertFalse($data['features'][0]['free']);
        $this->assertSame(5, $data['downloads']['free_audio']);
    }

    public function test_public_faq_hub_categories_by_category_and_search(): void
    {
        $hub = SupportKbCategory::query()->create(['tenant_id' => $this->tenant->id, 'name_fa' => 'خرید', 'slug' => 'buy', 'is_public' => true, 'sort_order' => 1]);
        $sub = SupportKbCategory::query()->create(['tenant_id' => $this->tenant->id, 'parent_id' => $hub->id, 'name_fa' => 'پرداخت', 'slug' => 'pay', 'is_public' => true, 'sort_order' => 2]);
        $other = SupportKbCategory::query()->create(['tenant_id' => $this->tenant->id, 'name_fa' => 'اشتراک', 'slug' => 'vip', 'is_public' => true, 'sort_order' => 3]);
        $mk = fn ($cat, $slug, $title, $body, $pub = true) => SupportKbArticle::query()->create(['tenant_id' => $this->tenant->id, 'category_id' => $cat->id,
            'slug' => $slug, 'title_fa' => $title, 'body_fa' => $body, 'is_published' => $pub, 'is_public' => true, 'published_at' => now()]);
        $mk($hub, 'q1', 'چطور خرید کنم؟', 'از سبد خرید');
        $mk($sub, 'q2', 'درگاه‌ها کدامند؟', 'همه درگاه‌های بانکی');
        $mk($other, 'q3', 'اشتراک چیست؟', 'دسترسی ویژه');
        $mk($other, 'q4', 'پیش‌نویس', 'x', false);

        $cats = collect($this->getJson('/api/v1/public/support/kb/categories', $this->h)->assertOk()->json('data'))->keyBy('slug');
        $this->assertSame(2, $cats['buy']['articles_count']);
        $this->assertSame($hub->id, $cats['pay']['parent_id']);
        $this->assertSame(1, $cats['vip']['articles_count']);

        $items = $this->getJson('/api/v1/public/support/kb?category=buy&with_body=1', $this->h)->assertOk()->json('data.items');
        $this->assertCount(2, $items);
        $this->assertArrayHasKey('body_fa', $items[0]);
        $this->assertCount(1, $this->getJson('/api/v1/public/support/kb?category=pay', $this->h)->json('data.items'));
        $this->getJson('/api/v1/public/support/kb?category=nope', $this->h)->assertNotFound();
        $found = $this->getJson('/api/v1/public/support/kb?search='.urlencode('بانکی'), $this->h)->assertOk()->json('data.items');
        $this->assertSame(['q2'], array_column($found, 'slug'));
        $this->assertSame('pay', $found[0]['category_slug']);
    }

    public function test_guest_sees_premium_poetry_locked(): void
    {
        $this->seedLockedPoetry();

        $res = $this->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk();
        $show = $res->json('data');
        $this->assertTrue($show['locked']);
        $this->assertSame([], $show['stanzas']);
        $this->assertCacheVaries($res, fullAccess: false);

        $media = collect($this->getJson('/api/v1/public/poetry/media', $this->h)->assertOk()->json('data'))->keyBy('title');
        $this->assertTrue($media['ویدیو ویژه']['locked']);
        $this->assertNull($media['ویدیو ویژه']['url']);

        $this->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertForbidden()->assertJsonPath('data.code', 'premium_required');
        $this->getJson('/api/v1/public/poetry/books/vip-book', $this->h)->assertOk()->assertJsonPath('data.locked', true);
        $highlights = collect($this->getJson('/api/v1/public/poetry/highlights', $this->h)->assertOk()->json('data'))->keyBy('title');
        $this->assertTrue($highlights['هایلایت ویژه']['locked']);
        $this->assertNull($highlights['هایلایت ویژه']['url']);
    }

    public function test_premium_member_via_bearer_sees_poetry_unlocked(): void
    {
        $this->seedLockedPoetry();
        app(MembershipService::class)->grant($this->customer, 1, 'month');
        $token = $this->customer->fresh()->createToken('spa')->plainTextToken;

        $res = $this->withToken($token)->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk();
        $show = $res->json('data');
        $this->assertFalse($show['locked']);
        $this->assertSame(['سه', 'چهار'], $show['stanzas'][0]['lines']);
        $this->assertCacheVaries($res, fullAccess: true);

        $media = collect($this->withToken($token)->getJson('/api/v1/public/poetry/media', $this->h)->json('data'))->keyBy('title');
        $this->assertFalse($media['ویدیو ویژه']['locked']);
        $this->assertSame('/storage/v.mp4', $media['ویدیو ویژه']['url']);
        $this->withToken($token)->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertOk();
        $this->withToken($token)->getJson('/api/v1/public/poetry/books/vip-book', $this->h)->assertOk()->assertJsonPath('data.locked', false);
        $highlights = collect($this->withToken($token)->getJson('/api/v1/public/poetry/highlights', $this->h)->json('data'))->keyBy('title');
        $this->assertFalse($highlights['هایلایت ویژه']['locked']);
        $this->assertSame('/storage/h.jpg', $highlights['هایلایت ویژه']['url']);
    }

    public function test_premium_member_via_auth_cookie_sees_poetry_unlocked(): void
    {
        $this->seedLockedPoetry();
        app(MembershipService::class)->grant($this->customer, 1, 'month');
        $token = $this->customer->fresh()->createToken('spa')->plainTextToken;

        $res = $this->withCredentials()
            ->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/poems/vip', $this->h)->assertOk();
        $show = $res->json('data');
        $this->assertFalse($show['locked']);
        $this->assertSame(['سه', 'چهار'], $show['stanzas'][0]['lines']);
        $this->assertCacheVaries($res, fullAccess: true);

        $media = collect($this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/media', $this->h)->json('data'))->keyBy('title');
        $this->assertFalse($media['ویدیو ویژه']['locked']);
        $this->assertSame('/storage/v.mp4', $media['ویدیو ویژه']['url']);
        $this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertOk();
        $this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/books/vip-book', $this->h)->assertOk()->assertJsonPath('data.locked', false);
        $highlights = collect($this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/highlights', $this->h)->json('data'))->keyBy('title');
        $this->assertFalse($highlights['هایلایت ویژه']['locked']);
        $this->assertSame('/storage/h.jpg', $highlights['هایلایت ویژه']['url']);
    }

    public function test_non_premium_logged_in_user_sees_poetry_locked(): void
    {
        $this->seedLockedPoetry();
        $regular = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        $token = $regular->createToken('spa')->plainTextToken;

        $res = $this->withToken($token)->getJson('/api/v1/public/poetry/poems/vip', $this->h)
            ->assertOk()->assertJsonPath('data.locked', true)->assertJsonPath('data.stanzas', []);
        $this->assertCacheVaries($res, fullAccess: false);
        $this->withToken($token)->getJson('/api/v1/public/poetry/poems/vip/text', $this->h)->assertForbidden();

        $this->flushHeaders();
        $this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/poems/vip', $this->h)
            ->assertOk()->assertJsonPath('data.locked', true);
        $media = collect($this->withCredentials()->withUnencryptedCookie(config('auth.cookie_name', 'webino_auth_token'), $token)
            ->getJson('/api/v1/public/poetry/media', $this->h)->json('data'))->keyBy('title');
        $this->assertTrue($media['ویدیو ویژه']['locked']);
        $this->assertNull($media['ویدیو ویژه']['url']);
    }

    protected function seedLockedPoetry(): void
    {
        $vip = PoetryPoem::query()->create(['slug' => 'vip', 'title' => 'ویژه', 'excerpt' => 'رمز', 'status' => 'published', 'is_premium' => true]);
        $vip->stanzas()->create(['position' => 0, 'type' => 'stanza', 'lines' => ['سه', 'چهار']]);
        PoetryMedia::query()->create(['title' => 'ویدیو ویژه', 'kind' => 'video', 'file_url' => '/storage/v.mp4', 'is_premium' => true]);
        PoetryBook::query()->create(['slug' => 'vip-book', 'title' => 'کتاب ویژه', 'status' => 'published', 'is_premium' => true]);
        PoetryHighlight::query()->create(['title' => 'هایلایت ویژه', 'kind' => 'image', 'file_url' => '/storage/h.jpg', 'is_premium' => true, 'status' => 'published']);
    }

    protected function assertCacheVaries(TestResponse $res, bool $fullAccess): void
    {
        $vary = strtolower((string) $res->headers->get('Vary'));
        $this->assertStringContainsString('authorization', $vary);
        $this->assertStringContainsString('cookie', $vary);
        $this->assertStringContainsString('x-tenant-domain', $vary);
        $cache = strtolower((string) $res->headers->get('Cache-Control'));
        $this->assertStringContainsString('private', $cache);
        if ($fullAccess) {
            $this->assertStringContainsString('no-store', $cache);
        } else {
            $this->assertStringContainsString('no-cache', $cache);
        }
    }
}
