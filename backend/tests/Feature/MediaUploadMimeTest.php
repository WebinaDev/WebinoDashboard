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

    public function test_media_upload_accepts_allowed_image_types(): void
    {
        Storage::fake('public');
        $tenant = $this->createTenant();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->enableSubmodules($tenant->id, ['core.media' => true]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('photo.jpg', 100, 'image/jpeg'),
        ])->assertCreated();
    }

    public function test_media_upload_rejects_invalid_svg(): void
    {
        Storage::fake('public');
        $tenant = $this->createTenant();
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->enableSubmodules($tenant->id, ['core.media' => true]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/media', [
            'file' => UploadedFile::fake()->create('icon.svg', 10, 'image/svg+xml'),
        ])->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_media_upload_sanitizes_svg(): void
    {
        Storage::fake('public');
        $tenant = $this->createTenant();
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->enableSubmodules($tenant->id, ['core.media' => true]);
        $this->actingAs($admin, 'sanctum');

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
    }
}
