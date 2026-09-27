<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ContentSystemTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $this->tenant = Tenant::query()->create([
            'name' => 'Content',
            'slug' => 'content',
            'domain' => 'content.test',
            'license_key' => 'k',
            'setup_completed' => true,
            'store_display_name' => 'Content',
            'default_currency' => 'IRT',
        ]);

        $this->enableSubmodules($this->tenant->id, [
            'core.media' => true,
            'magazine.articles' => true,
            'cms.pages' => true,
        ]);

        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
        $this->actingAs($this->admin, 'sanctum');
    }

    public function test_upload_with_folder_and_assign_category_tag(): void
    {
        $folder = $this->postJson('/api/v1/media/terms', [
            'kind' => 'folder',
            'name' => 'Covers',
        ])->assertCreated()->json('data');

        $category = $this->postJson('/api/v1/media/terms', [
            'kind' => 'category',
            'name' => 'Hero',
        ])->assertCreated()->json('data');

        $tag = $this->postJson('/api/v1/media/terms', [
            'kind' => 'tag',
            'name' => 'featured',
        ])->assertCreated()->json('data');

        $upload = $this->post('/api/v1/media', [
            'file' => UploadedFile::fake()->create('cover.jpg', 120, 'image/jpeg'),
            'folder_id' => $folder['id'],
            'category_ids' => json_encode([$category['id']]),
            'tag_ids' => json_encode([$tag['id']]),
            'alt' => 'Cover alt',
        ])->assertCreated()->json('data');

        $this->assertSame($folder['id'], $upload['folder_id']);
        $this->assertSame('covers', $upload['folder']);
        $this->assertContains($category['id'], $upload['category_ids']);
        $this->assertContains($tag['id'], $upload['tag_ids']);

        $this->patchJson('/api/v1/media/'.$upload['id'], [
            'title' => 'Hero cover',
            'category_ids' => [$category['id']],
            'tag_ids' => [$tag['id']],
        ])->assertOk()->assertJsonPath('data.title', 'Hero cover');

        $list = $this->getJson('/api/v1/media?folder_id='.$folder['id'])->assertOk()->json('data');
        $this->assertSame(1, $list['total']);
        $this->assertSame($upload['id'], $list['items'][0]['id']);
    }

    public function test_magazine_article_with_category_and_featured_media(): void
    {
        $media = $this->post('/api/v1/media', [
            'file' => UploadedFile::fake()->create('feature.jpg', 80, 'image/jpeg'),
        ])->assertCreated()->json('data');

        $cat = $this->postJson('/api/v1/magazine/categories', [
            'name' => 'News',
            'slug' => 'news',
        ])->assertCreated()->json('data');

        $article = $this->postJson('/api/v1/magazine/articles', [
            'title' => 'Hello magazine',
            'slug' => 'hello-magazine',
            'body' => '<p>Body</p>',
            'status' => 'published',
            'featured_media_id' => $media['id'],
            'categories' => [$cat['id']],
            'tags' => ['launch'],
            'seo' => ['title' => 'Hello SEO'],
        ])->assertCreated()->json('data');

        $this->assertSame('published', $article['status']);
        $this->assertSame($media['id'], $article['featured_media_id']);
        $this->assertContains($cat['id'], $article['categories']);
        $this->assertSame('launch', $article['tags'][0]['name']);

        $list = $this->getJson('/api/v1/magazine/articles')->assertOk()->json('data');
        $this->assertSame(1, $list['stats']['total']);
        $this->assertSame(1, $list['stats']['publish']);
        $this->assertSame('Hello magazine', $list['items'][0]['title']);
    }

    public function test_cms_child_page(): void
    {
        $parent = $this->postJson('/api/v1/cms/pages', [
            'title' => 'Parent',
            'slug' => 'parent',
            'status' => 'published',
            'body' => '<p>Parent</p>',
        ])->assertCreated()->json('data');

        $child = $this->postJson('/api/v1/cms/pages', [
            'title' => 'Child',
            'slug' => 'child',
            'status' => 'draft',
            'parent_id' => $parent['id'],
            'body' => '<p>Child</p>',
            'seo' => ['description' => 'child page'],
        ])->assertCreated()->json('data');

        $this->assertSame($parent['id'], $child['parent_id']);
        $this->assertSame('draft', $child['status']);

        $list = $this->getJson('/api/v1/cms/pages')->assertOk()->json('data');
        $this->assertSame(2, $list['stats']['total']);
        $childRow = collect($list['items'])->firstWhere('id', $child['id']);
        $this->assertSame($parent['id'], $childRow['parent']);
    }
}
