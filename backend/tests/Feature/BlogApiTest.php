<?php

namespace Tests\Feature;

use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\DashboardModule;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlogApiTest extends TestCase
{
    use RefreshDatabase;

    protected function actingBlogUser(): User
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 't-blog',
            'domain' => 'localhost',
            'setup_completed' => true,
        ]);

        DashboardModule::query()->create([
            'slug' => 'blog',
            'requires_license' => false,
            'git_repo' => null,
            'default_version' => '0.1.0',
        ]);
        TenantModule::query()->create([
            'tenant_id' => $tenant->id,
            'module_slug' => 'blog',
            'enabled' => true,
            'licensed' => true,
            'installed_version' => '0.1.0',
        ]);
        $this->enableSubmodule($tenant->id, 'blog', 'posts');

        return User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_admin_can_create_and_list_blog_posts(): void
    {
        $user = $this->actingBlogUser();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/blog/posts', [
                'title' => 'First post',
                'body' => 'Content',
                'status' => 'published',
                'published_at' => now()->toIso8601String(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'First post');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/blog/posts')
            ->assertOk()
            ->assertJsonPath('data.items.0.title', 'First post');

        $id = BlogPost::query()->where('tenant_id', $user->tenant_id)->value('id');
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/blog/posts/'.$id)
            ->assertOk()
            ->assertJsonPath('data.title', 'First post');
    }

    public function test_admin_can_sync_tags_and_categories(): void
    {
        $user = $this->actingBlogUser();

        $cat = BlogCategory::query()->create([
            'tenant_id' => $user->tenant_id,
            'slug' => 'news',
            'name' => 'News',
        ]);

        $res = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/blog/posts', [
                'title' => 'Tagged',
                'body' => '<p>Hi</p>',
                'status' => 'draft',
                'category_id' => $cat->id,
                'tags' => ['alpha', 'beta'],
            ])
            ->assertCreated();

        $this->assertCount(2, $res->json('data.tags'));
        $this->assertSame($cat->id, $res->json('data.category_id'));

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/blog/categories')
            ->assertOk()
            ->assertJsonPath('data.items.0.name', 'News');
    }

    public function test_public_blog_lists_published_posts(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 't2',
            'domain' => 'localhost',
        ]);
        $this->enableSubmodule($tenant->id, 'blog', 'posts');

        BlogPost::query()->create([
            'tenant_id' => $tenant->id,
            'slug' => 'visible',
            'title' => 'Visible',
            'status' => 'published',
            'published_at' => now(),
        ]);
        BlogPost::query()->create([
            'tenant_id' => $tenant->id,
            'slug' => 'draft',
            'title' => 'Draft',
            'status' => 'draft',
        ]);

        $res = $this->getJson('/api/v1/public/blog', ['HTTP_HOST' => 'localhost'])
            ->assertOk();

        $this->assertCount(1, $res->json('data'));
        $this->assertSame('visible', $res->json('data.0.slug'));
    }
}
