<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Services\Webhooks\WebhookDispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Cafe\Services\IntegrationKeys;
use Modules\Cafe\Services\PrintRouter;
use Modules\Cafe\Services\ReceiptLayout;
use Tests\TestCase;

/**
 * Bucket 7: where paper comes out, what a receipt says, whether a sticker is used, and what a
 * replayed offline sale does.
 *
 * Each of these has a failure mode that is invisible in normal operation and expensive when it
 * happens: a kitchen ticket that printed in the office, a replay that charges a guest twice, a
 * webhook that fires for every order in every tenant.
 */
class CafePrintingAndIntegrationsTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private \App\Models\User $owner;

    private int $branchId;

    private int $stationId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'print.test', 'slug' => 'print']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true]);

        $this->owner = \App\Models\User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->branchId = (int) DB::table('cafe_branches')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name_fa' => 'شعبه',
            'name_en' => 'Branch',
            'slug' => 'main',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->stationId = (int) DB::table('cafe_kitchen_stations')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branchId,
            'name_fa' => 'گریل',
            'name_en' => 'Grill',
            'slug' => 'grill',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function printer(string $name = 'Grill printer', ?int $branchId = null): int
    {
        return (int) DB::table('cafe_printers')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $branchId,
            'name' => $name,
            'kind' => 'edge',
            'target' => 'EPSON-TM-T88',
            'purpose' => 'kitchen',
            'paper_width_mm' => 80,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function route(int $printerId, ?int $stationId, string $document = 'kitchen', int $priority = 100): int
    {
        return (int) DB::table('cafe_print_routes')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'printer_id' => $printerId,
            'station_id' => $stationId,
            'document' => $document,
            'priority' => $priority,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** A station route beats the catch-all, so the grill ticket lands on the grill printer. */
    public function test_a_station_route_wins_over_the_catch_all(): void
    {
        $grill = $this->printer('Grill printer');
        $bar = $this->printer('Bar printer');
        $this->route($bar, null);
        $this->route($grill, $this->stationId);

        $printers = app(PrintRouter::class)->printersFor($this->tenant->id, $this->branchId, $this->stationId);

        $this->assertCount(1, $printers);
        $this->assertSame('Grill printer', $printers[0]['name']);
    }

    /** With no station route the fallback printer is used, not silence. */
    public function test_the_catch_all_route_is_the_fallback(): void
    {
        $bar = $this->printer('Bar printer');
        $this->route($bar, null);

        $printers = app(PrintRouter::class)->printersFor($this->tenant->id, $this->branchId, $this->stationId);

        $this->assertCount(1, $printers);
        $this->assertSame('Bar printer', $printers[0]['name']);
    }

    /**
     * No route means no printer, and the job says so.
     *
     * Printing a kitchen ticket on the receipt printer would be worse than not printing it:
     * the cook never sees the order and the cashier believes they did.
     */
    public function test_an_unrouted_ticket_reports_that_it_could_not_print(): void
    {
        $job = app(PrintRouter::class)->job($this->tenant->id, $this->branchId, $this->stationId, ['items' => []]);

        $this->assertFalse($job['routed']);
        $this->assertSame([], $job['printers']);
        $this->assertNotNull($job['warning']);
    }

    /** A receipt layout is per tenant and only stores the keys it knows. */
    public function test_the_receipt_layout_keeps_known_keys_only(): void
    {
        $this->actingAs($this->owner, 'sanctum');

        $layout = app(ReceiptLayout::class);

        $saved = $layout->put($this->tenant->id, [
            'show_qr' => false,
            'footer_note' => 'ممنون از حضور شما',
            'not_a_real_key' => 'ignored',
        ]);

        $this->assertFalse($saved['show_qr']);
        $this->assertSame('ممنون از حضور شما', $saved['footer_note']);
        $this->assertArrayNotHasKey('not_a_real_key', $saved);
        // Untouched values keep their shipped default.
        $this->assertTrue($saved['show_logo']);
    }

    /** The kitchen copy omits prices by default — a cook has no need for the margin. */
    public function test_a_kitchen_copy_hides_prices_by_default(): void
    {
        $this->assertTrue(app(ReceiptLayout::class)->defaults()['kitchen_hides_prices']);
    }

    /** An API key is stored only as a hash and resolves back to its tenant and scopes. */
    public function test_an_api_key_is_stored_as_a_hash_and_resolves(): void
    {
        $keys = app(IntegrationKeys::class);

        $issued = $keys->issue($this->tenant->id, 'Zettle', ['orders.read']);

        $row = DB::table('cafe_api_keys')->where('id', $issued['id'])->first();
        $this->assertSame(hash('sha256', $issued['key']), $row->key_hash);
        $this->assertNotSame($issued['key'], $row->key_hash, 'the key itself must never be stored');

        $resolved = $keys->resolve($issued['key']);
        $this->assertSame($this->tenant->id, $resolved['tenant_id']);
        $this->assertTrue($keys->allows($resolved['scopes'], 'orders.read'));
        $this->assertFalse($keys->allows($resolved['scopes'], 'accounting.read'));
    }

    /** A revoked key stops resolving, and an unknown key never resolves. */
    public function test_a_revoked_key_no_longer_resolves(): void
    {
        $keys = app(IntegrationKeys::class);
        $issued = $keys->issue($this->tenant->id, 'Retired', ['menu.read']);

        DB::table('cafe_api_keys')->where('id', $issued['id'])->update(['revoked_at' => now()]);

        $this->assertNull($keys->resolve($issued['key']));
        $this->assertNull($keys->resolve('wbn_made-up'));
    }

    /** A wildcard scope covers its family; it is not a free pass to everything. */
    public function test_a_wildcard_scope_covers_only_its_own_family(): void
    {
        $keys = app(IntegrationKeys::class);

        $this->assertTrue($keys->allows(['orders.*'], 'orders.write'));
        $this->assertFalse($keys->allows(['orders.*'], 'menu.write'));
    }

    /** A signature is deterministic for the same secret and body, and differs with either. */
    public function test_a_webhook_signature_is_verifiable(): void
    {
        $keys = app(IntegrationKeys::class);

        $first = $keys->signature('secret', '{"a":1}');
        $this->assertSame($first, $keys->signature('secret', '{"a":1}'));
        $this->assertNotSame($first, $keys->signature('secret', '{"a":2}'));
        $this->assertNotSame($first, $keys->signature('other', '{"a":1}'));
    }

    /** A hook subscribed to one event does not receive the others. */
    public function test_a_webhook_only_receives_the_events_it_subscribed_to(): void
    {
        DB::table('cafe_webhooks')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'Settlements only',
            'url' => 'https://example.test/hook',
            'events' => json_encode(['order.settled']),
            'secret' => 'k',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.created', ['order_id' => 1]);

        $this->assertSame(0, DB::table('cafe_webhook_deliveries')->count());

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.settled', ['order_id' => 1]);

        $this->assertSame(1, DB::table('cafe_webhook_deliveries')->count());
    }

    /** One tenant's hooks never receive another tenant's events. */
    public function test_webhooks_do_not_leak_between_tenants(): void
    {
        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'other']);

        DB::table('cafe_webhooks')->insert([
            'tenant_id' => $other->id,
            'name' => 'Elsewhere',
            'url' => 'https://example.test/hook',
            'events' => null,
            'secret' => 'k',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.created', ['order_id' => 1]);

        $this->assertSame(0, DB::table('cafe_webhook_deliveries')->count());
    }

    /**
     * The same offline sale replayed twice is one order.
     *
     * The till generates a client reference before the request; the unique index is what makes
     * the retry safe. Without it a dropped connection means the guest is charged twice.
     */
    public function test_a_replayed_offline_sale_does_not_create_a_second_order(): void
    {
        $product = \App\Models\Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Latte',
            'slug' => 'latte-'.uniqid(),
            'price_minor' => 50000,
            'currency' => 'IRT',
            'is_available' => true,
        ]);

        $payload = [
            'fulfillment' => 'takeaway',
            'client_ref' => 'till-1-abc',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ];

        $first = $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/v1/cafe/pos/orders', $payload)
            ->assertCreated();

        $second = $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/v1/cafe/pos/orders', $payload)
            ->assertOk();

        $this->assertSame(
            $first->json('data.id'),
            $second->json('data.id'),
            'the replay must return the original order',
        );
        $this->assertTrue($second->json('meta.replayed'));

        $this->assertSame(1, Order::query()->where('tenant_id', $this->tenant->id)->count());
    }

    /** Two different sales are still two orders. */
    public function test_distinct_client_references_create_distinct_orders(): void
    {
        $product = \App\Models\Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Latte',
            'slug' => 'latte-'.uniqid(),
            'price_minor' => 50000,
            'currency' => 'IRT',
            'is_available' => true,
        ]);

        foreach (['ref-a', 'ref-b'] as $ref) {
            $this->actingAs($this->owner, 'sanctum')
                ->postJson('/api/v1/cafe/pos/orders', [
                    'fulfillment' => 'takeaway',
                    'client_ref' => $ref,
                    'items' => [['product_id' => $product->id, 'quantity' => 1]],
                ])
                ->assertCreated();
        }

        $this->assertSame(2, Order::query()->where('tenant_id', $this->tenant->id)->count());
    }

    /** A delivered webhook is marked delivered and stamps the hook's last success. */
    public function test_a_queued_delivery_is_sent_and_marked_delivered(): void
    {
        \Illuminate\Support\Facades\Http::fake([
            'https://example.test/*' => \Illuminate\Support\Facades\Http::response(['ok' => true], 200),
        ]);

        $hookId = (int) DB::table('cafe_webhooks')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Orders',
            'url' => 'https://example.test/hook',
            'events' => null,
            'secret' => 'shh',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.settled', ['order_id' => 7]);

        $result = app(\App\Services\Webhooks\WebhookSender::class)->flush();

        $this->assertSame(1, $result['sent']);

        $delivery = DB::table('cafe_webhook_deliveries')->where('webhook_id', $hookId)->first();
        $this->assertSame('delivered', $delivery->status);
        $this->assertSame(200, (int) $delivery->response_status);

        $this->assertNotNull(DB::table('cafe_webhooks')->where('id', $hookId)->value('last_success_at'));
    }

    /** The signature sent is an HMAC of exactly the body, so the receiver can verify it. */
    public function test_the_delivered_signature_verifies_against_the_body(): void
    {
        $seen = null;

        \Illuminate\Support\Facades\Http::fake(function ($request) use (&$seen) {
            $seen = [
                'signature' => $request->header('X-Webino-Signature')[0] ?? null,
                'body' => $request->body(),
            ];

            return \Illuminate\Support\Facades\Http::response('', 200);
        });

        DB::table('cafe_webhooks')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'Signed',
            'url' => 'https://example.test/signed',
            'events' => null,
            'secret' => 'top-secret',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.created', ['order_id' => 9]);
        app(\App\Services\Webhooks\WebhookSender::class)->flush();

        $this->assertNotNull($seen);
        $this->assertSame(hash_hmac('sha256', $seen['body'], 'top-secret'), $seen['signature']);
    }

    /** A 4xx is a refusal, not a transient failure: it is not left queued for a retry. */
    public function test_a_client_error_is_not_retried(): void
    {
        \Illuminate\Support\Facades\Http::fake([
            'https://example.test/*' => \Illuminate\Support\Facades\Http::response('bad payload', 422),
        ]);

        DB::table('cafe_webhooks')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'Broken',
            'url' => 'https://example.test/broken',
            'events' => null,
            'secret' => 'k',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.created', ['order_id' => 1]);
        app(\App\Services\Webhooks\WebhookSender::class)->flush();

        $this->assertSame('failed', DB::table('cafe_webhook_deliveries')->value('status'));
    }

    /** A transport failure stays queued so the next run can try again. */
    public function test_a_transport_failure_stays_queued_for_a_retry(): void
    {
        \Illuminate\Support\Facades\Http::fake(function () {
            throw new \Illuminate\Http\Client\ConnectionException('connection refused');
        });

        DB::table('cafe_webhooks')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'Down',
            'url' => 'https://example.test/down',
            'events' => null,
            'secret' => 'k',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(WebhookDispatcher::class)->queue($this->tenant->id, 'order.created', ['order_id' => 1]);
        app(\App\Services\Webhooks\WebhookSender::class)->flush();

        $delivery = DB::table('cafe_webhook_deliveries')->first();
        $this->assertSame('queued', $delivery->status);
        $this->assertSame(1, (int) $delivery->attempts);
    }
}
