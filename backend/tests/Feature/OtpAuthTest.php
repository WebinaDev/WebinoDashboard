<?php

namespace Tests\Feature;

use App\Models\ModuleSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Auth\OtpAuthService;
use App\Services\Auth\OtpIdentifier;
use App\Services\Marketplace\Adapters\TorobAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class OtpAuthTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenantA;

    protected Tenant $tenantB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->tenantA = Tenant::query()->create([
            'name' => 'Tenant A',
            'slug' => 'tenant-a',
            'domain' => 'a.test',
            'setup_completed' => true,
        ]);
        $this->tenantB = Tenant::query()->create([
            'name' => 'Tenant B',
            'slug' => 'tenant-b',
            'domain' => 'b.test',
            'setup_completed' => true,
        ]);
    }

    /** @param  array<string, mixed>  $overrides */
    private function enableOtp(int $tenantId, array $overrides = []): void
    {
        ModuleSetting::query()->updateOrCreate(
            [
                'tenant_id' => $tenantId,
                'module_slug' => 'settings',
                'submodule_slug' => 'site.sms',
            ],
            [
                'payload' => array_merge([
                    'enabled' => true,
                    'otp_login_enabled' => true,
                    'otp_register_enabled' => false,
                    'otp_expiry_minutes' => 5,
                    'otp_length' => 5,
                    'otp_max_attempts' => 5,
                    'otp_channels' => [
                        'sms' => false,
                        'email' => true,
                        'bale' => false,
                        'telegram' => false,
                    ],
                ], $overrides),
            ]
        );
        Cache::flush();
    }

    public function test_nonexistent_user_gets_fake_success_without_cache(): void
    {
        Mail::fake();
        $this->enableOtp($this->tenantA->id);

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/send-otp', ['identifier' => 'missing@a.test'])
            ->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.channels_sent', []);

        Mail::assertNothingSent();

        $parsed = OtpIdentifier::parse('missing@a.test');
        $key = app(OtpAuthService::class)->otpCacheKey($this->tenantA->id, $parsed['key']);
        $this->assertNull(Cache::get($key));
    }

    public function test_cross_tenant_verify_fails(): void
    {
        $phone = '09121234567';
        $user = User::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'phone' => $phone,
            'email' => 'phone-user@a.test',
        ]);

        $this->enableOtp($this->tenantA->id);
        $this->enableOtp($this->tenantB->id);

        Mail::fake();
        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/send-otp', ['identifier' => $phone])
            ->assertOk();

        $parsed = OtpIdentifier::parse($phone);
        $payload = Cache::get(app(OtpAuthService::class)->otpCacheKey($this->tenantA->id, $parsed['key']));
        $this->assertIsArray($payload);

        $code = '54321';
        Cache::put(
            app(OtpAuthService::class)->otpCacheKey($this->tenantA->id, $parsed['key']),
            array_merge($payload, ['code_hash' => Hash::make($code)]),
            300
        );

        $this->withHeader('X-Tenant-Domain', 'b.test')
            ->postJson('/api/v1/auth/verify-otp', [
                'identifier' => $phone,
                'code' => $code,
            ])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->tokens()->first());
    }

    public function test_attempt_limit_blocks_verify(): void
    {
        $this->enableOtp($this->tenantA->id, ['otp_max_attempts' => 2]);
        User::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'email' => 'limit@a.test',
        ]);

        Mail::fake();
        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/send-otp', ['identifier' => 'limit@a.test'])
            ->assertOk();

        $parsed = OtpIdentifier::parse('limit@a.test');
        $otp = app(OtpAuthService::class);

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/verify-otp', [
                'identifier' => 'limit@a.test',
                'code' => '00000',
            ])
            ->assertStatus(422);

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/verify-otp', [
                'identifier' => 'limit@a.test',
                'code' => '00001',
            ])
            ->assertStatus(422);

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/verify-otp', [
                'identifier' => 'limit@a.test',
                'code' => '00002',
            ])
            ->assertStatus(429);

        $this->assertSame(2, (int) Cache::get($otp->attemptsCacheKey($this->tenantA->id, $parsed['key'])));
    }

    public function test_send_rate_limit_per_identity(): void
    {
        $this->enableOtp($this->tenantA->id);
        User::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'email' => 'rate@a.test',
        ]);

        Mail::fake();

        for ($i = 0; $i < 5; $i++) {
            $this->withHeader('X-Tenant-Domain', 'a.test')
                ->postJson('/api/v1/auth/send-otp', ['identifier' => 'rate@a.test'])
                ->assertOk();
        }

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/send-otp', ['identifier' => 'rate@a.test'])
            ->assertStatus(429);
    }

    public function test_successful_phone_login_issues_token(): void
    {
        $phone = '09129876543';
        $normalized = TorobAdapter::normalizePhone($phone);
        $this->assertNotNull($normalized);

        User::factory()->create([
            'tenant_id' => $this->tenantA->id,
            'phone' => $normalized,
            'email' => 'mobile@a.test',
            'role' => 'customer',
        ]);

        $this->enableOtp($this->tenantA->id);
        Mail::fake();

        $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/send-otp', ['identifier' => $phone])
            ->assertOk()
            ->assertJsonPath('data.channels_sent', ['email']);

        $parsed = OtpIdentifier::parse($phone);
        $payload = Cache::get(app(OtpAuthService::class)->otpCacheKey($this->tenantA->id, $parsed['key']));
        $this->assertIsArray($payload);

        $code = '98765';
        Cache::put(
            app(OtpAuthService::class)->otpCacheKey($this->tenantA->id, $parsed['key']),
            array_merge($payload, ['code_hash' => Hash::make($code)]),
            300
        );

        $response = $this->withHeader('X-Tenant-Domain', 'a.test')
            ->postJson('/api/v1/auth/verify-otp', [
                'identifier' => $phone,
                'code' => $code,
                'remember' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.user.phone', $normalized);

        $this->assertNotEmpty($response->json('data.user'));
        $this->assertTrue(
            User::query()->where('tenant_id', $this->tenantA->id)->where('phone', $normalized)->first()?->tokens()->exists() ?? false
        );
    }
}
