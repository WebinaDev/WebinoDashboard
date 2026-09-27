<?php

namespace Tests\Feature;

use App\Http\Middleware\ThrottleApiToken;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class StaffRouteGateTest extends TestCase
{
    use RefreshDatabase;

    /** Authenticated endpoints every signed-in role may call (account portal, storefront cart, dashboard shell). */
    private const SHARED_URIS = [
        'api/v1/auth/check',
        'api/v1/auth/refresh',
        'api/v1/auth/user',
        'api/v1/auth/change-password',
        'api/v1/tenant',
        'api/v1/bootstrap',
        'api/v1/setup/status',
        'api/v1/kernel/registry',
        'api/v1/kernel/activations',
        'api/v1/maps/search',
        'api/v1/maps/default-address',
        'api/v1/loyalty/rewards',
        'api/v1/loyalty/balance',
        'api/v1/loyalty/redeem',
        'api/v1/shipping/quote',
        'api/v1/cart',
        'api/v1/cart/items',
        'api/v1/cart/purchase-type',
        'api/v1/cart/items/{product}',
        'api/v1/checkout',
        'api/v1/payments/intent',
    ];

    private const SHARED_PREFIXES = ['api/v1/auth/2fa/', 'api/v1/account/'];

    protected Tenant $tenant;

    protected User $admin;

    protected User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Gate',
            'slug' => 'staff-gate',
            'domain' => 'gate.test',
            'setup_completed' => true,
        ]);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->customer = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
    }

    /** @return list<RoutingRoute> */
    private function authenticatedApiRoutes(): array
    {
        return collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $r) => str_starts_with($r->uri(), 'api/v1/')
                && in_array('auth:sanctum', $r->gatherMiddleware(), true))
            ->values()
            ->all();
    }

    private function isShared(RoutingRoute $route): bool
    {
        $uri = $route->uri();
        if (in_array($uri, self::SHARED_URIS, true)) {
            return ! ($uri === 'api/v1/loyalty/rewards' && in_array('PUT', $route->methods(), true));
        }
        foreach (self::SHARED_PREFIXES as $prefix) {
            if (str_starts_with($uri, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public function test_every_authenticated_route_is_staff_gated_or_explicitly_shared(): void
    {
        $unguarded = [];
        foreach ($this->authenticatedApiRoutes() as $route) {
            $gated = in_array('staff', $route->gatherMiddleware(), true);
            if ($gated === $this->isShared($route)) {
                $unguarded[] = implode('|', $route->methods()).' '.$route->uri().($gated ? ' (gated but listed as shared)' : '');
            }
        }

        $this->assertSame([], $unguarded, "Routes must be behind the staff middleware or listed as shared:\n".implode("\n", $unguarded));
    }

    public function test_customer_gets_403_on_every_staff_route(): void
    {
        $this->withoutMiddleware([ThrottleApiToken::class, ThrottleRequests::class]);
        $this->actingAs($this->customer, 'sanctum');
        $failures = [];

        foreach ($this->authenticatedApiRoutes() as $route) {
            if (! in_array('staff', $route->gatherMiddleware(), true)) {
                continue;
            }
            $uri = preg_replace('/\{[^}]+\?\}/', '', $route->uri());
            $uri = preg_replace_callback('/\{([^}]+)\}/', function (array $m) use ($route) {
                $pattern = $route->wheres[$m[1]] ?? null;
                if (is_string($pattern) && preg_match('/^[a-z0-9_\\\\\-]+(\|[a-z0-9_\\\\\-]+)*$/i', $pattern)) {
                    return stripslashes(explode('|', $pattern)[0]);
                }

                return '1';
            }, $uri);
            $uri = rtrim('/'.$uri, '/');
            $method = collect($route->methods())->first(fn ($m) => $m !== 'HEAD');

            $status = $this->json($method, $uri)->status();
            if ($status !== 403) {
                $failures[] = "{$method} {$uri} → {$status}";
            }
        }

        $this->assertSame([], $failures, "Customer reached staff routes:\n".implode("\n", $failures));
    }

    public function test_customer_cannot_read_or_moderate_other_users_data(): void
    {
        $ticket = SupportTicket::query()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->admin->id,
            'subject' => 'Private',
            'status' => 'open',
        ]);

        $this->actingAs($this->customer, 'sanctum');
        $this->getJson('/api/v1/shop/tickets')->assertForbidden()->assertJsonPath('errors.code', 'STAFF_ONLY');
        $this->getJson("/api/v1/shop/tickets/{$ticket->id}")->assertForbidden();
        $this->postJson("/api/v1/shop/tickets/{$ticket->id}/replies", ['body' => 'x'])->assertForbidden();
        $this->getJson('/api/v1/product-reviews')->assertForbidden();
        $this->patchJson('/api/v1/product-reviews/1', ['status' => 'approved'])->assertForbidden();
    }

    public function test_customer_keeps_portal_and_staff_keeps_back_office(): void
    {
        $this->actingAs($this->customer, 'sanctum');
        $this->getJson('/api/v1/auth/user')->assertOk()->assertJsonPath('data.tenant.domain', 'gate.test');
        $this->getJson('/api/v1/tenant')->assertOk();
        $this->getJson('/api/v1/account/notifications')->assertOk();
        $this->getJson('/api/v1/account/tickets')->assertOk();

        $staff = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);
        $this->actingAs($staff, 'sanctum');
        $this->getJson('/api/v1/shop/tickets')->assertOk();
        $this->getJson('/api/v1/product-reviews')->assertOk();
    }
}
