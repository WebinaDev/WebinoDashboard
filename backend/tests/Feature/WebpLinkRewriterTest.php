<?php

namespace Tests\Feature;

use App\Models\MediaAsset;
use App\Services\Media\WebpLinkRewriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebpLinkRewriterTest extends TestCase
{
    use RefreshDatabase;

    public function test_rewrites_converted_originals_plain_and_escaped_tenant_scoped(): void
    {
        $t = $this->createTenant(['domain' => uniqid().'.test', 'slug' => uniqid('t')]);
        $other = $this->createTenant(['domain' => uniqid().'.test', 'slug' => uniqid('t')]);
        MediaAsset::query()->withoutGlobalScopes()->forceCreate([
            'tenant_id' => $t->id, 'path' => 'media/1/hero.webp', 'original_path' => 'media/1/hero.jpg',
            'disk' => 'public', 'mime' => 'image/webp', 'size' => 10,
        ]);
        $body = json_encode(['img' => 'https://x.ir/storage/media/1/hero.jpg', 'other' => '/storage/media/1/logo.png']);
        $out = WebpLinkRewriter::rewrite($t->id, $body);
        $this->assertStringContainsString('media\/1\/hero.webp', $out);
        $this->assertStringContainsString('logo.png', $out);
        $this->assertSame($body, WebpLinkRewriter::rewrite($other->id, $body));
        config(['webino_runtime.serve_webp' => false]);
        $this->assertSame($body, WebpLinkRewriter::rewrite($t->id, $body));
    }
}
