<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\StaffImpersonationToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class StaffImpersonationTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-staff-impersonation-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.webino.staff_impersonation_secret' => self::SECRET,
        ]);
    }

    public function test_exchange_sets_session_and_hides_switch_urls(): void
    {
        $this->seedAdmin();

        $response = $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token(),
        ]);

        $response->assertOk()
            ->assertJsonPath('data.password_must_change', false)
            ->assertJsonPath('data.impersonation.active', true)
            ->assertJsonPath('data.impersonation.staff_name', 'علی رضایی')
            ->assertJsonPath('data.impersonation.domain', 'shop.test')
            ->assertJsonPath('data.impersonation.customer.name', 'شرکت نمونه')
            ->assertJsonPath('data.impersonation.sites.1.site_id', '1002');

        $sites = $response->json('data.impersonation.sites');
        $this->assertIsArray($sites);
        foreach ($sites as $site) {
            $this->assertArrayNotHasKey('switch_url', $site);
        }

        $plain = $this->plainFrom($response);
        $this->assertNotSame('', $plain);

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/gate')
            ->assertOk()
            ->assertJsonPath('data.authenticated', true)
            ->assertJsonPath('data.staff_impersonation', true)
            ->assertJsonPath('data.password_must_change', false);

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/user')
            ->assertOk()
            ->assertJsonPath('data.impersonation.site_name', 'فروشگاه نمونه');

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/check')
            ->assertOk()
            ->assertJsonPath('data.password_must_change', false);
    }

    public function test_cookie_token_is_accepted_and_cleared(): void
    {
        $this->seedAdmin();
        $jwt = $this->token();

        $response = $this->withCredentials()
            ->withUnencryptedCookie(StaffImpersonationToken::COOKIE, $jwt)
            ->postJson('/api/v1/auth/impersonate', []);

        $response->assertOk()
            ->assertJsonPath('data.impersonation.staff_id', '42');
        $response->assertCookieExpired(StaffImpersonationToken::COOKIE);
    }

    public function test_replay_is_idempotent_then_rejected(): void
    {
        $this->seedAdmin();
        $jti = 'replay-jti-01';
        $jwt = $this->token(['jti' => $jti]);

        $this->postJson('/api/v1/auth/impersonate', ['token' => $jwt])->assertOk();
        $this->postJson('/api/v1/auth/impersonate', ['token' => $jwt])->assertOk();

        Cache::forget('staff_impersonate_replay:'.hash('sha256', $jti));

        $this->postJson('/api/v1/auth/impersonate', ['token' => $jwt])
            ->assertStatus(401)
            ->assertJsonPath('errors.code', 'IMPERSONATION_REPLAY');
    }

    public function test_bad_signature_expired_and_wrong_site_are_rejected(): void
    {
        $this->seedAdmin();

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([], 'other-secret'),
        ])->assertStatus(401)->assertJsonPath('errors.code', 'IMPERSONATION_INVALID');

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'expired-jti-1',
                'iat' => time() - 400,
                'exp' => time() - 90,
            ]),
        ])->assertStatus(401)->assertJsonPath('errors.code', 'IMPERSONATION_EXPIRED');

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'mismatch-jti1',
                'domain' => 'other.test',
            ]),
        ])->assertStatus(403)->assertJsonPath('errors.code', 'IMPERSONATION_SITE_MISMATCH');
    }

    public function test_missing_secret_and_missing_admin_are_unavailable(): void
    {
        config([
            'services.webino.staff_impersonation_secret' => '',
            'services.webino.provision_hmac_secret' => '',
        ]);
        $this->seedAdmin();

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => StaffImpersonationToken::sign($this->claims(), self::SECRET),
        ])->assertStatus(503)->assertJsonPath('errors.code', 'IMPERSONATION_UNAVAILABLE');

        config(['services.webino.staff_impersonation_secret' => self::SECRET]);
        $this->createTenant(['domain' => 'empty.test', 'slug' => 'empty-shop']);

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'no-admin-jti1',
                'domain' => 'empty.test',
                'site_id' => '9',
            ]),
        ])->assertStatus(422)->assertJsonPath('errors.code', 'IMPERSONATION_UNAVAILABLE');
    }

    public function test_provision_secret_is_the_fallback(): void
    {
        config([
            'services.webino.staff_impersonation_secret' => '',
            'services.webino.provision_hmac_secret' => 'fallback-secret',
        ]);
        $this->seedAdmin();

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([], 'fallback-secret'),
        ])->assertOk()->assertJsonPath('data.impersonation.active', true);
    }

    public function test_switch_uses_embedded_url_and_rejects_current_or_foreign_hosts(): void
    {
        $this->seedAdmin();
        $plain = $this->plainFrom($this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token(),
        ])->assertOk());

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/v1/auth/impersonation/switch', ['site_id' => '1002'])
            ->assertOk()
            ->assertJsonPath('data.switch_url', 'https://two.test/login?impersonate_token=next-token');

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/v1/auth/impersonation/switch', ['site_id' => '1001'])
            ->assertStatus(422)
            ->assertJsonPath('errors.code', 'IMPERSONATION_CURRENT_SITE');

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/v1/auth/impersonation/switch', ['site_id' => '1003'])
            ->assertStatus(422)
            ->assertJsonPath('errors.code', 'IMPERSONATION_SWITCH_UNAVAILABLE');
    }

    public function test_switch_can_ask_erp_for_a_login_url(): void
    {
        $this->seedAdmin();
        config([
            'services.webino.erp_base_url' => 'https://erp.example.com',
            'services.webino.erp_api_token' => 'erp-token',
        ]);
        Http::fake([
            'https://erp.example.com/api/v1/staff-impersonation/switch' => Http::response([
                'data' => ['switch_url' => 'https://three.test/login?impersonate_token=minted'],
            ]),
        ]);

        $plain = $this->plainFrom($this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'erp-switch-jti',
                'sites' => [
                    [
                        'site_id' => '1001',
                        'name' => 'فروشگاه نمونه',
                        'domain' => 'shop.test',
                    ],
                    [
                        'site_id' => '1003',
                        'name' => 'سایت سوم',
                        'domain' => 'three.test',
                    ],
                ],
            ]),
        ])->assertOk());

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/v1/auth/impersonation/switch', ['site_id' => '1003'])
            ->assertOk()
            ->assertJsonPath('data.switch_url', 'https://three.test/login?impersonate_token=minted');
    }

    public function test_refresh_replaces_sites_from_allowlisted_erp_url(): void
    {
        $this->seedAdmin();
        config([
            'services.webino.erp_base_url' => 'https://erp.example.com',
            'services.webino.erp_api_token' => 'erp-token',
        ]);
        Http::fake([
            'https://erp.example.com/api/v1/staff-impersonation/sites' => Http::response([
                'data' => [
                    'sites' => [
                        ['site_id' => '1001', 'name' => 'فروشگاه نمونه', 'domain' => 'shop.test'],
                        ['site_id' => '88', 'name' => 'سایت تازه‌شده', 'domain' => 'fresh.test', 'switch_url' => 'https://fresh.test/login?impersonate_token=x'],
                    ],
                ],
            ]),
        ]);

        $plain = $this->plainFrom($this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'refresh-sites-1',
                'sites_url' => 'https://erp.example.com/api/v1/staff-impersonation/sites',
            ]),
        ])->assertOk());

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/impersonation?refresh=1')
            ->assertOk()
            ->assertJsonPath('data.sites.1.name', 'سایت تازه‌شده')
            ->assertJsonPath('data.sites.1.domain', 'fresh.test');

        $sites = $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/impersonation')
            ->json('data.sites');
        foreach ($sites as $site) {
            $this->assertArrayNotHasKey('switch_url', $site);
        }
    }

    public function test_exit_returns_to_erp_and_ends_the_session(): void
    {
        $this->seedAdmin();
        $plain = $this->plainFrom($this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token(['jti' => 'exit-jti-0001']),
        ])->assertOk());

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->postJson('/api/v1/auth/impersonation/exit')
            ->assertOk()
            ->assertJsonPath('data.return_url', 'https://erp.example.com/admin/sites')
            ->assertCookieExpired((string) config('auth.cookie_name', 'webino_auth_token'));

        $this->assertSame(0, PersonalAccessToken::query()->count());

        // The test process keeps the guard user from the previous request.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/impersonation')
            ->assertUnauthorized();
    }

    public function test_single_tenant_localhost_fallback_matches_request_host(): void
    {
        $tenant = $this->createTenant([
            'domain' => '',
            'slug' => 'only-shop',
        ]);
        User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'password_must_change' => true,
        ]);

        $this->postJson('/api/v1/auth/impersonate', [
            'token' => $this->token([
                'jti' => 'local-fallback1',
                'domain' => 'localhost',
                'site_id' => '1',
                'sites' => [],
            ]),
        ])->assertOk()->assertJsonPath('data.impersonation.domain', 'localhost');
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function token(array $overrides = [], ?string $secret = null): string
    {
        return StaffImpersonationToken::sign(
            $this->claims($overrides),
            $secret ?? self::SECRET,
        );
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function claims(array $overrides = []): array
    {
        return array_merge([
            'iss' => 'webino-erp',
            'aud' => 'webinodashboard',
            'jti' => (string) Str::uuid(),
            'iat' => time(),
            'exp' => time() + 300,
            'staff_id' => '42',
            'staff_name' => 'علی رضایی',
            'site_id' => '1001',
            'site_name' => 'فروشگاه نمونه',
            'domain' => 'shop.test',
            'customer' => ['id' => '7', 'name' => 'شرکت نمونه', 'email' => 'owner@example.com'],
            'return_url' => 'https://erp.example.com/admin/sites',
            'sites' => [
                [
                    'site_id' => '1001',
                    'name' => 'فروشگاه نمونه',
                    'domain' => 'shop.test',
                    'customer' => ['id' => '7', 'name' => 'شرکت نمونه'],
                ],
                [
                    'site_id' => '1002',
                    'name' => 'سایت دوم',
                    'domain' => 'two.test',
                    'customer' => ['id' => '8', 'name' => 'مشتری ۲'],
                    'switch_url' => 'https://two.test/login?impersonate_token=next-token',
                ],
                [
                    'site_id' => '1003',
                    'name' => 'سایت ناامن',
                    'domain' => 'three.test',
                    'switch_url' => 'https://evil.test/login?impersonate_token=stolen',
                ],
            ],
        ], $overrides);
    }

    private function seedAdmin(): User
    {
        $tenant = $this->createTenant([
            'name' => 'فروشگاه نمونه',
            'domain' => 'shop.test',
            'slug' => 'shop-test',
            'setup_completed' => true,
        ]);

        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'name' => 'Shop Admin',
            'password_must_change' => true,
        ]);
    }

    private function plainFrom(TestResponse $response): string
    {
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === config('auth.cookie_name', 'webino_auth_token')) {
                return (string) $cookie->getValue();
            }
        }

        $this->fail('auth cookie was not set');
    }
}
