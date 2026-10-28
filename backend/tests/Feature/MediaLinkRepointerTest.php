<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Tenant;
use App\Services\Media\MediaLinkRepointer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MediaLinkRepointerTest extends TestCase
{
    use RefreshDatabase;

    public function test_repoints_plain_links_and_stays_in_tenant(): void
    {
        $a = Tenant::query()->create(['name' => 'A', 'slug' => 'a', 'domain' => 'a.test', 'license_key' => 'k1', 'default_currency' => 'IRR']);
        $b = Tenant::query()->create(['name' => 'B', 'slug' => 'b', 'domain' => 'b.test', 'license_key' => 'k2', 'default_currency' => 'IRR']);
        $old = 'media/7/photo.jpg';
        $ca = Category::query()->create(['tenant_id' => $a->id, 'name' => 'C', 'slug' => 'c', 'description' => '<img src="/storage/'.$old.'">']);
        $cb = Category::query()->create(['tenant_id' => $b->id, 'name' => 'C', 'slug' => 'c', 'description' => '<img src="/storage/'.$old.'">']);

        $r = new MediaLinkRepointer;
        $this->assertSame(1, $r->repoint($a->id, $old, 'media/7/photo.webp', true));
        $this->assertGreaterThanOrEqual(1, $r->repoint($a->id, $old, 'media/7/photo.webp'));

        $this->assertStringContainsString('/storage/media/7/photo.webp', (string) $ca->fresh()->description);
        $this->assertStringContainsString('/storage/media/7/photo.jpg', (string) $cb->fresh()->description);
    }
}
