<?php

namespace Tests\Unit\Integrations;

use App\Services\Integrations\InstagramSettings;
use PHPUnit\Framework\TestCase;

class InstagramSettingsTest extends TestCase
{
    public function test_sanitize_strips_handle_and_clamps_cache(): void
    {
        $out = InstagramSettings::sanitize([
            'enabled' => '1',
            'handle' => '@Parisma.Gallery!',
            'ig_user_id' => '12abc34',
            'access_token' => ' secret ',
            'cache_hours' => 99,
        ]);

        $this->assertTrue($out['enabled']);
        $this->assertSame('Parisma.Gallery', $out['handle']);
        $this->assertSame('1234', $out['ig_user_id']);
        $this->assertSame('secret', $out['access_token']);
        $this->assertSame(6, $out['cache_hours']);
    }

    public function test_mask_hides_middle_of_token(): void
    {
        $masked = InstagramSettings::mask('abcdefghijklmnop');
        $this->assertStringStartsWith('abcd', $masked);
        $this->assertStringEndsWith('mnop', $masked);
        $this->assertStringContainsString('*', $masked);
    }
}
