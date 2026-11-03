<?php

namespace Tests\Feature;

use App\Models\CmsPage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Performance\PerformanceSettingsService;
use App\Services\Security\CaptchaService;
use App\Services\Security\SecurityAuditService;
use App\Services\Security\SecuritySettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityHubTest extends TestCase
{
    use RefreshDatabase;

    private function actingAdmin(): array
    {
        $tenant = Tenant::query()->create([
            'name' => 'SecHub',
            'slug' => 'sec-hub',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
            'is_active' => true,
        ]);
        Sanctum::actingAs($user);

        return [$tenant, $user];
    }

    public function test_audit_endpoint_returns_score_and_checklist(): void
    {
        [$tenant] = $this->actingAdmin();

        $res = $this->getJson('/api/v1/security/audit');
        $res->assertOk();
        $this->assertIsString($res->json('data.insights.grade'));
        $this->assertNotSame('', $res->json('data.insights.grade'));
        $this->assertIsInt($res->json('data.insights.score'));
        $this->assertNotEmpty($res->json('data.insights.checklist'));
        $this->assertArrayHasKey('captcha', $res->json('data.settings'));
        $this->assertGreaterThan(0, (int) $tenant->id);
    }

    public function test_apply_fix_enables_forms_captcha_with_numeric_provider(): void
    {
        [$tenant] = $this->actingAdmin();
        SecuritySettings::save((int) $tenant->id, [
            'captcha' => ['provider' => 'none', 'protect' => ['forms' => false]],
        ]);

        CmsPage::query()->create([
            'tenant_id' => $tenant->id,
            'title' => 'Contact',
            'slug' => 'contact',
            'status' => 'published',
            'builder_published' => [
                'type' => 'page',
                'children' => [
                    ['type' => 'form', 'props' => ['captcha' => false, 'title' => 'Hi']],
                ],
            ],
        ]);

        $res = $this->postJson('/api/v1/security/audit/apply', ['check_id' => 'forms_captcha']);
        $res->assertOk()->assertJsonPath('data.applied', true);
        $this->assertSame('numeric', $res->json('data.settings.captcha.provider'));
        $this->assertTrue($res->json('data.settings.captcha.protect.forms'));

        $insights = app(SecurityAuditService::class)->insights((int) $tenant->id);
        $forms = collect($insights['checklist'])->firstWhere('id', 'forms_captcha');
        $this->assertTrue($forms['ok']);
    }

    public function test_cdn_fix_does_not_mutate_performance_settings(): void
    {
        [$tenant] = $this->actingAdmin();
        $perf = app(PerformanceSettingsService::class);
        $before = $perf->get((int) $tenant->id);

        $res = $this->postJson('/api/v1/security/audit/apply', ['check_id' => 'cdn_present']);
        $res->assertOk()
            ->assertJsonPath('data.applied', false)
            ->assertJsonPath('data.message', 'navigate_performance');

        $after = $perf->get((int) $tenant->id);
        $this->assertSame($before['cdn_provider'] ?? null, $after['cdn_provider'] ?? null);
    }

    public function test_numeric_captcha_challenge_and_form_gate(): void
    {
        [$tenant] = $this->actingAdmin();
        SecuritySettings::save((int) $tenant->id, [
            'captcha' => [
                'provider' => 'numeric',
                'protect' => ['forms' => true],
            ],
            'spam' => ['honeypot' => true, 'min_submit_ms' => 0],
        ]);

        $challenge = CaptchaService::issueNumeric((int) $tenant->id);
        $this->assertArrayHasKey('challenge_id', $challenge);

        // Wrong answer
        $this->assertFalse(CaptchaService::verify(
            (int) $tenant->id,
            'forms',
            '999',
            $challenge['challenge_id'],
            '127.0.0.1'
        ));

        // Empty token must fail while protect.forms is on.
        $this->assertFalse(CaptchaService::verify((int) $tenant->id, 'forms', '', null, '127.0.0.1'));

        // When protect is off, verify always passes.
        SecuritySettings::save((int) $tenant->id, [
            'captcha' => ['provider' => 'numeric', 'protect' => ['forms' => false]],
        ]);
        $this->assertTrue(CaptchaService::verify((int) $tenant->id, 'forms', null, null, '127.0.0.1'));
    }

    public function test_ssl_and_hide_origin_apply(): void
    {
        [$tenant] = $this->actingAdmin();

        $this->postJson('/api/v1/security/audit/apply', ['check_id' => 'force_https'])
            ->assertOk()
            ->assertJsonPath('data.settings.ssl.force_https', true);

        $this->postJson('/api/v1/security/audit/apply', ['check_id' => 'hide_origin_ip'])
            ->assertOk()
            ->assertJsonPath('data.settings.edge.hide_origin_ip', true);

        $this->postJson('/api/v1/security/audit/apply', ['check_id' => 'hsts'])
            ->assertOk()
            ->assertJsonPath('data.settings.ssl.hsts', true);
    }

    public function test_settings_save_keeps_captcha_secret_masked(): void
    {
        [$tenant] = $this->actingAdmin();

        $this->putJson('/api/v1/settings/site/security', [
            'payload' => [
                'captcha' => [
                    'provider' => 'hcaptcha',
                    'site_key' => 'site-public',
                    'secret_key' => 'super-secret-value',
                    'protect' => ['forms' => true],
                ],
            ],
        ])->assertOk();

        $shown = SecuritySettings::get((int) $tenant->id);
        $this->assertSame('hcaptcha', $shown['captcha']['provider']);
        $this->assertSame('site-public', $shown['captcha']['site_key']);
        $this->assertStringContainsString('•', $shown['captcha']['secret_key']);
        $this->assertStringEndsWith('alue', $shown['captcha']['secret_key']);
        $this->assertSame('super-secret-value', CaptchaService::rawSecret((int) $tenant->id));
    }
}
