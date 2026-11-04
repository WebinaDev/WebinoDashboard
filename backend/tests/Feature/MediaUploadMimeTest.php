<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaUploadMimeTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $tenant = $this->createTenant();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->enableSubmodules($tenant->id, ['core.media' => true]);

        return $admin;
    }

    public function test_media_upload_accepts_allowed_image_types(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('photo.jpg', 100, 'image/jpeg'),
        ])->assertCreated();
    }

    public function test_media_upload_accepts_audio_and_video(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('poem.mp3', 200, 'audio/mpeg'),
        ])->assertCreated()
            ->assertJsonPath('data.mime', 'audio/mpeg');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('recite.m4a', 200, 'audio/mp4'),
        ])->assertCreated();

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('clip.mp4', 400, 'video/mp4'),
        ])->assertCreated()
            ->assertJsonPath('data.mime', 'video/mp4');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('clip.webm', 400, 'video/webm'),
        ])->assertCreated();

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('clip.mov', 400, 'video/quicktime'),
        ])->assertCreated();
    }

    public function test_media_upload_rejects_executables_and_html(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('shell.php', 10, 'application/x-php'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('page.html', 10, 'text/html'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('tool.exe', 10, 'application/x-msdownload'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_media_upload_rejects_invalid_svg(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('icon.svg', 10, 'image/svg+xml'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_media_upload_sanitizes_svg(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin(), 'sanctum');

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="4" height="4" onclick="x()"/></svg>';
        $res = $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->createWithContent('logo.svg', $svg),
        ])->assertCreated();

        $files = Storage::disk('public')->allFiles();
        $this->assertCount(1, $files);
        $stored = Storage::disk('public')->get($files[0]);
        $this->assertStringEndsWith('.svg', $files[0]);
        $this->assertStringContainsString('<rect', $stored);
        $this->assertStringNotContainsString('script', $stored);
        $this->assertStringNotContainsString('onload', $stored);
        $this->assertStringNotContainsString('onclick', $stored);
        $this->assertSame('image/svg+xml', $res->json('data.mime'));
    }
}
