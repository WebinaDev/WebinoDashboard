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

    public function test_media_upload_rejects_svg(): void
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
}
