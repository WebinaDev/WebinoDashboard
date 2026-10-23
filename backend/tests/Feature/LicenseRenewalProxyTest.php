<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\LicenseRenewalController;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LicenseRenewalProxyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Tenant::query()->create(['name' => 'S', 'slug' => 's', 'domain' => 'localhost', 'setup_completed' => true]);
        config(['services.webino.base_url' => 'https://erp.test']);
    }

    private function payload(): array
    {
        return ['data' => [
            'domain' => 'localhost', 'product' => 'webino', 'plan' => ['code' => 'pro', 'name' => 'حرفه‌ای'],
            'status' => 'suspended', 'expires_at' => '2026-10-01T23:59:59+03:30', 'days_left' => 0, 'site_status' => 'suspended',
            'renewable' => true, 'banner' => ['show' => true, 'level' => 'danger', 'message' => 'x'], 'currency' => 'IRR',
            'options' => [['id' => 12, 'months' => 12, 'label' => '۱۲ ماهه', 'price_irr' => 60000000, 'discount_percent' => 10,
                'final_irr' => 54000000, 'final_toman' => 5400000, 'new_expires_at' => '2027-10-01T23:59:59+03:30', 'checkout_url' => 'https://erp.test/renew/1/pay/12']],
            'renew_url' => 'https://erp.test/renew/1', 'url_expires_at' => '2026-10-30T23:20:00+03:30',
        ]];
    }

    public function test_proxies_tenant_domain_and_return_url(): void
    {
        Http::fake(['erp.test/*' => Http::response($this->payload(), 200)]);
        $this->getJson('/api/v1/public/license-renewal?domain=evil.ir&return_url='.urlencode('https://localhost/'))
            ->assertOk()->assertJsonPath('data.renew_url', 'https://erp.test/renew/1')->assertJsonPath('data.options.0.final_toman', 5400000)
            ->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('success', true);
        Http::assertSent(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://erp.test/api/v1/public/license-renewal')
            && $r['domain'] === 'localhost' && $r['return_url'] === 'https://localhost/');
    }

    public function test_drops_non_https_return_url(): void
    {
        Http::fake(['erp.test/*' => Http::response($this->payload(), 200)]);
        $this->getJson('/api/v1/public/license-renewal?return_url='.urlencode('javascript:alert(1)'))->assertOk();
        Http::assertSent(fn (HttpRequest $r) => ! isset($r['return_url']));
    }

    public function test_passes_through_404_and_429(): void
    {
        Http::fake(['erp.test/*' => Http::sequence()
            ->push(['message' => 'not found'], 404)
            ->push(['message' => 'slow down'], 429, ['Retry-After' => '30'])]);
        $this->getJson('/api/v1/public/license-renewal')->assertStatus(404);
        $this->getJson('/api/v1/public/license-renewal')->assertStatus(429)->assertHeader('Retry-After', '30');
    }

    public function test_transport_failure_is_502(): void
    {
        Http::fake(fn () => throw new ConnectionException('down'));
        $this->getJson('/api/v1/public/license-renewal')->assertStatus(502);
    }

    public function test_normalize_domain(): void
    {
        $this->assertSame('example.ir', LicenseRenewalController::normalizeDomain('https://WWW.Example.ir:443/x'));
    }
}
