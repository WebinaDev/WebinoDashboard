<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderPagesTest extends TestCase
{
    use RefreshDatabase;

    public function test_draft_publish_and_public_document(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'builder-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->actingAs($admin, 'sanctum');

        $created = $this->postJson('/api/v1/builder/pages', [
            'title' => 'خانه',
            'slug' => 'home',
            'document' => [
                'version' => 1,
                'sections' => [[
                    'id' => 'sec_home',
                    'columns' => [[
                        'id' => 'col_home',
                        'span' => 12,
                        'widgets' => [[
                            'id' => 'w_heading',
                            'type' => 'heading',
                            'props' => ['text' => 'ویبینو'],
                        ]],
                    ]],
                ]],
            ],
        ])->assertCreated()->json('data');

        $this->assertFalse($created['has_published']);

        $this->getJson('/api/v1/public/builder/pages/home', ['HTTP_HOST' => 'localhost'])
            ->assertNotFound();

        $this->postJson('/api/v1/builder/pages/'.$created['id'].'/publish')
            ->assertOk()
            ->assertJsonPath('data.has_published', true);

        $this->getJson('/api/v1/public/builder/pages/home', ['HTTP_HOST' => 'localhost'])
            ->assertOk()
            ->assertJsonPath('data.document.sections.0.id', 'sec_home');
    }

    public function test_header_template_and_wordpress_scaffold(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'builder-chrome']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role' => 'admin',
        ]);
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/builder/templates/header', [
            'title' => 'سربرگ',
            'document' => ['version' => 1, 'sections' => []],
        ])->assertOk();

        $this->postJson('/api/v1/builder/templates/header/publish')->assertOk();

        $this->getJson('/api/v1/public/builder/templates/header', ['HTTP_HOST' => 'localhost'])
            ->assertOk()
            ->assertJsonPath('data.kind', 'header');

        $probe = $this->postJson('/api/v1/import/wordpress/probe', [
            'source_url' => 'https://example.com',
        ])->assertOk()->json('data');

        $this->assertSame('scaffold', $probe['status']);
        $this->assertContains('woo_products', $probe['resources']);

        $this->postJson('/api/v1/import/wordpress/start', [
            'source_url' => 'https://example.com',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'scaffold');
    }
}
