<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ErpLinkApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.webino.provision_hmac_secret' => 'test-provision-secret']);
        $this->tenant = Tenant::query()->create(['name' => 'Shop', 'slug' => 'shop', 'domain' => 'shop.example.com', 'setup_completed' => true, 'license_status' => 'active', 'crm_account_id' => 42]);
    }

    private function signed(string $path, array $payload, ?int $ts = null, string $secret = 'test-provision-secret', string $token = 'test-token-123')
    {
        $body = json_encode($payload + ['ts' => $ts ?? time()], JSON_THROW_ON_ERROR);

        return $this->call('POST', '/api/v1/erp-link/'.$path, [], [], [], [
            'HTTP_X-Provision-Token' => $token,
            'HTTP_X-Provision-Signature' => hash_hmac('sha256', $body, $secret),
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
        ], $body);
    }

    private function buyer(): User
    {
        $u = (new User)->forceFill(['name' => 'Buyer', 'email' => 'Buyer@Example.com', 'phone' => '09121234567', 'password' => Hash::make('x'), 'tenant_id' => $this->tenant->id, 'role' => 'customer', 'kyc_status' => 'verified']);
        $u->save();
        Order::query()->create(['tenant_id' => $this->tenant->id, 'user_id' => $u->id, 'number' => 'A-1', 'status' => 'paid', 'total_minor' => 1000, 'subtotal_minor' => 1000, 'currency' => 'IRT']);
        SupportTicket::query()->create(['tenant_id' => $this->tenant->id, 'user_id' => $u->id, 'subject' => 'Help', 'status' => 'open']);

        return $u;
    }

    public function test_rejects_bad_token_signature_and_stale_ts(): void
    {
        $this->signed('customer', ['email' => 'a@b.c'], null, 'test-provision-secret', 'wrong')->assertForbidden();
        $this->signed('customer', ['email' => 'a@b.c'], null, 'other-secret')->assertForbidden();
        $this->signed('customer', ['email' => 'a@b.c'], time() - 3600)->assertForbidden();
    }

    public function test_customer_lookup_by_email_and_phone(): void
    {
        $this->buyer();
        $r = $this->signed('customer', ['email' => 'buyer@example.com'])->assertOk();
        $r->assertJsonPath('data.matches.0.kyc.status', 'verified')
            ->assertJsonPath('data.matches.0.stats.orders_count', 1)
            ->assertJsonPath('data.matches.0.stats.open_tickets', 1)
            ->assertJsonPath('data.is_owner_site', false)
            ->assertJsonMissingPath('data.matches.0.user.bank_sheba');
        $this->signed('customer', ['phone' => '+98 912 123 4567'])->assertOk()->assertJsonCount(1, 'data.matches');
        $this->signed('customer', [])->assertOk()->assertJsonCount(0, 'data.matches');
    }

    public function test_owner_site_summary_by_erp_id(): void
    {
        $this->buyer();
        $this->signed('customer', ['erp_customer_id' => 42])->assertOk()
            ->assertJsonPath('data.is_owner_site', true)
            ->assertJsonPath('data.site.orders_count', 1)
            ->assertJsonPath('data.site.revenue_minor', 1000);
    }

    public function test_usage_metrics(): void
    {
        $this->buyer();
        $this->signed('usage', [])->assertOk()
            ->assertJsonPath('data.metrics.orders', 1)
            ->assertJsonPath('data.metrics.customers', 1);
    }

    public function test_suspension_is_reversible_and_blocks_entitlement(): void
    {
        $this->signed('suspension', ['suspended' => true, 'reason' => 'debt'])->assertOk()->assertJsonPath('data.suspended', true);
        $this->assertTrue($this->tenant->fresh()->isSuspended());
        $this->assertFalse($this->tenant->fresh()->isLicenseEntitled());
        $this->signed('suspension', ['suspended' => false])->assertOk()->assertJsonPath('data.suspended', false);
        $this->assertTrue($this->tenant->fresh()->isLicenseEntitled());
    }
}
