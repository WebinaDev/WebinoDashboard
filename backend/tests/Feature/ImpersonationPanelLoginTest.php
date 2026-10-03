<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ImpersonationPanelLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_panel_login_keeps_staff_context_off_the_browser_and_can_switch(): void
    {
        $tenant = $this->createTenant(['domain' => 'cafe.test', 'name' => 'Cafe']);
        $admin = User::query()->create([
            'name' => 'Owner',
            'email' => 'owner@cafe.test',
            'password' => Hash::make('secret-not-used'),
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'password_must_change' => true,
        ]);

        $this->withoutMiddleware(EncryptCookies::class);

        $passport = 'staff-passport-not-for-the-browser';
        $body = json_encode([
            'next' => '/dashboard/builder',
            'impersonation' => [
                'staff_id' => 4,
                'staff_name' => 'Sara Staff',
                'customer_name' => 'Cafe Customer',
                'site_name' => 'Cafe',
                'domain' => 'cafe.test',
                'provision_id' => 9,
                'return_url' => 'https://erp.test/dashboard/admin/platform/sites/9',
                'expires_at' => gmdate('c', time() + 1200),
                'passport' => $passport,
                'sites' => [
                    [
                        'provision_id' => 9,
                        'domain' => 'cafe.test',
                        'name' => 'Cafe',
                        'customer_name' => 'Cafe Customer',
                        'current' => true,
                    ],
                    [
                        'provision_id' => 10,
                        'domain' => 'shop.test',
                        'name' => 'Shop',
                        'customer_name' => 'Shop Customer',
                        'current' => false,
                    ],
                ],
            ],
        ], JSON_THROW_ON_ERROR);

        $issued = $this->provision('panel-login', $body);
        $issued->assertOk();
        $url = (string) $issued->json('data.login_url');
        $this->assertStringContainsString('next=%2Fdashboard%2Fbuilder', $url);
        $this->assertStringNotContainsString($passport, $issued->getContent());
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertNotEmpty($query['panel_token'] ?? null);

        $login = $this->postJson('/api/v1/auth/panel-login', [
            'panel_token' => $query['panel_token'],
        ]);
        $login->assertOk()
            ->assertJsonPath('data.password_must_change', false)
            ->assertJsonPath('data.impersonation.staff_name', 'Sara Staff')
            ->assertJsonPath('data.impersonation.customer_name', 'Cafe Customer');
        $this->assertStringNotContainsString($passport, $login->getContent());

        $cookie = $login->getCookie('webino_auth_token', false);
        $this->assertNotNull($cookie);
        $this->withHeader('Authorization', 'Bearer '.$cookie->getValue());

        $this->getJson('/api/v1/tenant')->assertOk();
        $user = $this->getJson('/api/v1/auth/user');
        $user->assertOk()->assertJsonPath('data.impersonation.domain', 'cafe.test');
        $this->assertStringNotContainsString($passport, $user->getContent());

        config(['services.webino.base_url' => 'https://erp.test']);
        Http::fake([
            'https://erp.test/api/v1/site-builder/impersonate/exchange' => Http::response([
                'data' => ['url' => 'https://shop.test/login?panel_token=next-site'],
            ], 200),
            'https://erp.test/api/v1/site-builder/impersonate/exit' => Http::response([
                'data' => ['return_url' => 'https://erp.test/dashboard/admin/platform/sites/9'],
            ], 200),
        ]);

        $this->postJson('/api/v1/auth/impersonation/switch', [
            'provision_id' => 10,
            'next' => 'https://evil.test',
        ])->assertOk()->assertJsonPath('data.url', 'https://shop.test/login?panel_token=next-site');

        Http::assertSent(function ($request) use ($passport) {
            return $request->url() === 'https://erp.test/api/v1/site-builder/impersonate/exchange'
                && $request['passport'] === $passport
                && $request['next'] === '/dashboard'
                && (int) $request['provision_id'] === 10;
        });

        $this->postJson('/api/v1/auth/impersonation/exit')
            ->assertOk()
            ->assertJsonPath('data.return_url', 'https://erp.test/dashboard/admin/platform/sites/9');

        $this->assertNotNull($admin->id);
        $this->assertNull(Cache::get('panel_login:'.$query['panel_token']));
    }

    public function test_legacy_panel_login_still_issues_a_url_without_impersonation(): void
    {
        $tenant = $this->createTenant(['domain' => 'cafe.test']);
        User::query()->create([
            'name' => 'Owner',
            'email' => 'owner@cafe.test',
            'password' => Hash::make('secret'),
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);

        $body = '{}';
        $issued = $this->provision('panel-login', $body);
        $issued->assertOk();
        $this->assertStringContainsString('/login?panel_token=', (string) $issued->json('data.login_url'));
        $this->assertStringContainsString('next=%2Fdashboard', (string) $issued->json('data.login_url'));
    }

    private function provision(string $path, string $body): \Illuminate\Testing\TestResponse
    {
        $signature = hash_hmac('sha256', $body, 'test-provision-secret');

        return $this->call(
            'POST',
            '/api/v1/provision/'.$path,
            [],
            [],
            [],
            [
                'HTTP_X-Provision-Token' => 'test-token-123',
                'HTTP_X-Provision-Signature' => $signature,
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
            ],
            $body,
        );
    }
}
