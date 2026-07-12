<?php

namespace Tests\Feature;

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
            ->assertJsonPath('data.0.title', 'First post');
    }

    public function test_public_blog_lists_published_posts(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'T',
            'slug' => 't2',
            'domain' => 'localhost',
        ]);

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
