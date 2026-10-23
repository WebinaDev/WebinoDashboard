<?php

namespace Tests\Feature;

use App\Models\MediaAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaWebpConversionTest extends TestCase
{
    use RefreshDatabase;

    private function jpegBytes(int $w = 2400, int $h = 1200): string
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 30, 30));
        ob_start();
        imagejpeg($img, null, 90);

        return (string) ob_get_clean();
    }

    private function admin(): User
    {
        $tenant = $this->createTenant();
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->enableSubmodules($tenant->id, ['core.media' => true]);

        return $admin;
    }

    public function test_upload_serves_webp_and_keeps_original(): void
    {
        if (! function_exists('imagewebp')) {
            $this->markTestSkipped('GD WebP not available');
        }
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $res = $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->createWithContent('photo.jpg', $this->jpegBytes()),
        ])->assertCreated();

        $this->assertSame('image/webp', $res->json('data.mime'));
        $this->assertStringEndsWith('.webp', $res->json('data.url'));
        $this->assertSame('image/jpeg', $res->json('data.original_mime'));
        $asset = MediaAsset::query()->firstOrFail();
        Storage::disk('public')->assertExists($asset->path);
        Storage::disk('public')->assertExists($asset->original_path);
        [$w] = getimagesizefromstring(Storage::disk('public')->get($asset->path));
        $this->assertSame(2000, $w);
    }

    public function test_non_image_payload_keeps_original_without_failing(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');
        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('photo.jpg', 10, 'image/jpeg'),
        ])->assertCreated();
        $this->assertNull(MediaAsset::query()->firstOrFail()->original_path);
    }

    public function test_backfill_command_is_idempotent_and_supports_dry_run(): void
    {
        if (! function_exists('imagewebp')) {
            $this->markTestSkipped('GD WebP not available');
        }
        Storage::fake('public');
        $tenant = $this->createTenant();
        Storage::disk('public')->put('media/'.$tenant->id.'/a.png', (function () {
            $img = imagecreatetruecolor(50, 50);
            ob_start();
            imagepng($img);

            return (string) ob_get_clean();
        })());
        $asset = MediaAsset::query()->create([
            'tenant_id' => $tenant->id, 'path' => 'media/'.$tenant->id.'/a.png', 'disk' => 'public',
            'mime' => 'image/png', 'size' => 1, 'original_name' => 'a.png', 'title' => 'a', 'slug' => 'a',
        ]);

        $this->artisan('media:convert-webp', ['--dry-run' => true])->expectsOutputToContain('Would convert: 1')->assertSuccessful();
        $this->assertSame('image/png', $asset->fresh()->mime);

        $this->artisan('media:convert-webp')->expectsOutputToContain('Converted: 1')->assertSuccessful();
        $fresh = $asset->fresh();
        $this->assertSame('image/webp', $fresh->mime);
        $this->assertSame('media/'.$tenant->id.'/a.png', $fresh->original_path);
        Storage::disk('public')->assertExists('media/'.$tenant->id.'/a.webp');

        $this->artisan('media:convert-webp')->expectsOutputToContain('Converted: 0')->assertSuccessful();
    }

    public function test_animated_gif_detection(): void
    {
        $frame = "\x00\x21\xF9\x04\x04\x0a\x00\x00\x00\x2C";
        $this->assertTrue(\App\Services\Media\WebpConverter::isAnimatedGif('GIF89a'.$frame.'xx'.$frame));
        $this->assertFalse(\App\Services\Media\WebpConverter::isAnimatedGif('GIF89a'.$frame));
    }
}
