<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SidebarGroupsExtrasTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected User $customer;

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
        ]);
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->customer = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'customer',
            'name' => 'Customer',
        ]);
        $this->actingAs($this->admin, 'sanctum');
    }

    public function test_staff_ticket_reply_sets_answered_status(): void
    {
        $ticket = SupportTicket::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'subject' => 'Help',
            'status' => 'open',
        ]);
        SupportTicketReply::query()->create([
            'tenant_id' => $this->tenant->id,
            'ticket_id' => $ticket->id,
            'user_id' => $this->customer->id,
            'is_staff' => false,
            'body' => 'Need help',
            'created_at' => now(),
        ]);

        $list = $this->getJson('/api/v1/shop/tickets')->assertOk()->json('data');
        $this->assertSame(1, $list['total']);
        $this->assertSame('Help', $list['items'][0]['subject']);

        $this->postJson("/api/v1/shop/tickets/{$ticket->id}/replies", [
            'body' => 'We can help',
        ])->assertOk();

        $ticket->refresh();
        $this->assertSame('answered', $ticket->status);
        $this->assertDatabaseHas('support_ticket_replies', [
            'ticket_id' => $ticket->id,
            'is_staff' => 1,
            'body' => 'We can help',
        ]);
        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $this->customer->id,
            'type' => 'ticket',
        ]);
    }

    public function test_open_inbox_filters_open_tickets(): void
    {
        SupportTicket::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'subject' => 'Open one',
            'status' => 'open',
        ]);
        SupportTicket::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->customer->id,
            'subject' => 'Closed one',
            'status' => 'closed',
        ]);

        $open = $this->getJson('/api/v1/shop/tickets?status=open')->assertOk()->json('data');
        $this->assertSame(1, $open['total']);
        $this->assertSame('Open one', $open['items'][0]['subject']);
    }

    public function test_notifications_mark_read(): void
    {
        $n = UserNotification::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->admin->id,
            'type' => 'info',
            'title' => 'Hello',
            'body' => 'World',
            'created_at' => now(),
        ]);

        $inbox = $this->getJson('/api/v1/account/notifications')->assertOk()->json('data');
        $this->assertSame(1, $inbox['unread']);
        $this->assertFalse($inbox['items'][0]['read']);

        $this->postJson("/api/v1/account/notifications/{$n->id}/read")->assertOk();
        $inbox2 = $this->getJson('/api/v1/account/notifications')->assertOk()->json('data');
        $this->assertSame(0, $inbox2['unread']);
        $this->assertTrue($inbox2['items'][0]['read']);
    }

    public function test_bulk_sale_apply_and_remove_sale_price_minor(): void
    {
        $product = Product::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sale item',
            'slug' => 'sale-item',
            'price_minor' => 10000,
            'sale_price_minor' => null,
            'currency' => 'IRT',
            'status' => 'publish',
            'stock' => 5,
            'stock_status' => 'instock',
            'is_available' => true,
            'is_hidden' => false,
            'type' => 'simple',
        ]);

        $apply = $this->postJson('/api/v1/shop/products/bulk-sale', [
            'action' => 'apply',
            'percent' => 20,
            'days' => 7,
            'product_ids' => [$product->id],
        ])->assertOk()->json('data');

        $this->assertSame(1, $apply['ok']);
        $product->refresh();
        $this->assertSame(8000, (int) $product->sale_price_minor);

        $remove = $this->postJson('/api/v1/shop/products/bulk-sale', [
            'action' => 'remove',
            'product_ids' => [$product->id],
        ])->assertOk()->json('data');

        $this->assertSame(1, $remove['ok']);
        $product->refresh();
        $this->assertNull($product->sale_price_minor);
    }
}
