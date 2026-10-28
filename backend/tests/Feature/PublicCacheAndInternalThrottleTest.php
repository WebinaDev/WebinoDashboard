<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Support\PublicCache\PublicResponseCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class PublicCacheAndInternalThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create(['name' => 'S', 'slug' => 's', 'domain' => 'localhost', 'setup_completed' => true]);
        config(['webino_runtime.public_api_cache' => true, 'cache.default' => 'array']);
    }

    public function test_x_public_cache_header_survives_response_formatter(): void
    {
        $this->getJson('/api/v1/public/site-status')->assertOk()->assertHeader('X-Public-Cache', 'MISS');
        $this->getJson('/api/v1/public/site-status')->assertOk()->assertHeader('X-Public-Cache', 'HIT')
            ->assertJsonPath('data.status', 'active');
    }

    public function test_internal_secret_bypasses_guest_limiter_and_spoofed_header_does_not(): void
    {
        config(['webino_runtime.api_rate_limit_per_minute' => 2, 'webino_runtime.internal_api_secret' => str_repeat('k', 32)]);
        RateLimiter::clear('api-user:guest|127.0.0.1');
        for ($i = 0; $i < 4; $i++) {
            $this->getJson('/api/v1/public/site-status', ['X-Webino-Internal' => str_repeat('k', 32)])->assertOk();
        }
        $this->getJson('/api/v1/public/site-status', ['X-Webino-Internal' => 'wrong-wrong-wrong-wrong'])->assertOk();
        $this->getJson('/api/v1/public/site-status', ['X-Webino-Internal' => 'wrong-wrong-wrong-wrong'])->assertOk();
        $this->getJson('/api/v1/public/site-status', ['X-Webino-Internal' => 'wrong-wrong-wrong-wrong'])->assertStatus(429);
    }

    public function test_volatile_models_do_not_bump_public_cache_version(): void
    {
        $this->assertTrue(PublicResponseCache::isVolatile(new \App\Models\Cart));
        $this->assertTrue(PublicResponseCache::isVolatile(new \App\Models\SecurityEvent));
        $this->assertFalse(PublicResponseCache::isVolatile(new \App\Models\CafeEvent));
        $this->assertFalse(PublicResponseCache::isVolatile($this->tenant));
        $v = PublicResponseCache::version($this->tenant->id);
        usleep(2000);
        $this->tenant->update(['name' => 'S2']);
        $this->assertNotSame($v, PublicResponseCache::version($this->tenant->id));
    }
}
