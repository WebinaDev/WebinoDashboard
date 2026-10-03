<?php

namespace Tests\Unit;

use App\Services\Auth\StaffImpersonationException;
use App\Services\Auth\StaffImpersonationToken;
use Tests\TestCase;

class StaffImpersonationTokenTest extends TestCase
{
    private const SECRET = 'unit-secret';

    public function test_round_trip_verifies_claims(): void
    {
        $token = StaffImpersonationToken::sign($this->claims(), self::SECRET);
        $claims = StaffImpersonationToken::verify($token, self::SECRET, 600);

        $this->assertSame('42', $claims['staff_id']);
        $this->assertSame('shop.test', $claims['domain']);
    }

    public function test_rejects_tampered_signature(): void
    {
        $token = StaffImpersonationToken::sign($this->claims(), self::SECRET);
        $parts = explode('.', $token);
        $parts[2] = str_repeat('a', strlen($parts[2]));

        $this->expectException(StaffImpersonationException::class);
        StaffImpersonationToken::verify(implode('.', $parts), self::SECRET, 600);
    }

    public function test_rejects_alg_none(): void
    {
        $header = rtrim(strtr(base64_encode('{"alg":"none","typ":"JWT"}'), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode((string) json_encode($this->claims())), '+/', '-_'), '=');

        try {
            StaffImpersonationToken::verify($header.'.'.$payload.'.', self::SECRET, 600);
            $this->fail('unsigned token was accepted');
        } catch (StaffImpersonationException $e) {
            $this->assertSame('IMPERSONATION_INVALID', $e->errorCode);
        }
    }

    public function test_rejects_expired_token(): void
    {
        $token = StaffImpersonationToken::sign($this->claims([
            'iat' => time() - 400,
            'exp' => time() - 120,
        ]), self::SECRET);

        try {
            StaffImpersonationToken::verify($token, self::SECRET, 600);
            $this->fail('expired token was accepted');
        } catch (StaffImpersonationException $e) {
            $this->assertSame('IMPERSONATION_EXPIRED', $e->errorCode);
        }
    }

    public function test_rejects_lifetime_longer_than_cap(): void
    {
        $token = StaffImpersonationToken::sign($this->claims([
            'exp' => time() + 5000,
        ]), self::SECRET);

        $this->expectException(StaffImpersonationException::class);
        StaffImpersonationToken::verify($token, self::SECRET, 600);
    }

    public function test_switch_url_must_target_the_site_login(): void
    {
        $this->assertSame(
            'https://two.test/login?impersonate_token=abc',
            StaffImpersonationToken::sanitizeSwitchUrl('https://two.test/login?impersonate_token=abc', 'two.test'),
        );
        $this->assertNull(StaffImpersonationToken::sanitizeSwitchUrl('https://evil.test/login', 'two.test'));
        $this->assertNull(StaffImpersonationToken::sanitizeSwitchUrl('https://two.test/dashboard', 'two.test'));
        $this->assertNull(StaffImpersonationToken::sanitizeSwitchUrl('javascript:alert(1)', 'two.test'));
    }

    public function test_normalize_host_strips_scheme_port_and_path(): void
    {
        $this->assertSame('shop.test', StaffImpersonationToken::normalizeHost('HTTPS://Shop.Test:443/login'));
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
            'jti' => 'jti-unit-01',
            'iat' => time(),
            'exp' => time() + 120,
            'staff_id' => '42',
            'staff_name' => 'Ali',
            'site_id' => '1001',
            'domain' => 'shop.test',
            'customer' => ['id' => '7', 'name' => 'Acme'],
            'sites' => [],
        ], $overrides);
    }
}
