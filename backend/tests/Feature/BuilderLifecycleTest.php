<?php

namespace Tests\Feature;

use App\Models\CmsPage;
use App\Models\SeoRedirect;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function setUpShop(): array
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'life-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');
        $doc = ['version' => 2, 'sections' => [['id' => 's1', 'columns' => []]]];
        $id = $this->postJson('/api/v1/builder/pages', ['title' => 'درباره', 'slug' => 'about', 'document' => $doc])->json('data.id');

        return [$tenant, $admin, $id, $doc];
    }

    public function test_seo_lang_translations_and_public_payload(): void
    {
        [$tenant, , $id] = $this->setUpShop();
        $en = $this->postJson('/api/v1/builder/pages', ['title' => 'About', 'slug' => 'about-en', 'document' => ['version' => 2, 'sections' => [['id' => 'x', 'columns' => []]]]])->json('data.id');
        $this->putJson("/api/v1/builder/pages/$id/settings", ['seo' => ['seo_title' => '<b>درباره ما</b>', 'noindex' => true, 'canonical' => 'javascript:x'], 'lang' => 'fa'])->assertUnprocessable();
        $this->putJson("/api/v1/builder/pages/$id/settings", ['seo' => ['seo_title' => '<b>درباره ما</b>', 'noindex' => true, 'seo_og_image' => '/media/a.jpg'], 'lang' => 'fa'])
            ->assertOk()->assertJsonPath('data.seo.seo_title', 'درباره ما')->assertJsonPath('data.seo.seo_robots', 'noindex,follow');
        $this->putJson("/api/v1/builder/pages/$en/settings", ['lang' => 'en', 'translation_of' => $id])->assertOk()->assertJsonPath('data.translations.0.id', $id);
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertOk();
        $this->postJson("/api/v1/builder/pages/$en/publish")->assertOk();

        $meta = $this->getJson('/api/v1/public/seo/meta?type=page&slug=about', ['X-Tenant-Domain' => 'localhost'])->assertOk()->json('data.meta');
        $this->assertSame('noindex,follow', $meta['robots']);
        $this->assertSame('en', $meta['alternates'][1]['lang'] ?? $meta['alternates'][0]['lang']);
        $public = $this->getJson('/api/v1/public/pages/about', ['X-Tenant-Domain' => 'localhost'])->assertOk()->json('data');
        $this->assertArrayNotHasKey('meta', $public);
        $this->assertArrayNotHasKey('password', $public);
    }

    public function test_unpublish_discard_schedule_and_slug_redirect(): void
    {
        [$tenant, , $id] = $this->setUpShop();
        $this->postJson("/api/v1/builder/pages/$id/discard")->assertUnprocessable();
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertOk();
        $this->patchJson("/api/v1/builder/pages/$id", ['document' => ['version' => 2, 'sections' => [['id' => 'changed', 'columns' => []]]]])->assertOk();
        $this->postJson("/api/v1/builder/pages/$id/discard")->assertOk()->assertJsonPath('data.document.sections.0.id', 's1');

        $this->patchJson("/api/v1/builder/pages/$id", ['slug' => 'about-us'])->assertOk();
        $this->patchJson("/api/v1/builder/pages/$id", ['slug' => 'team'])->assertOk();
        $this->assertSame('/pages/team', SeoRedirect::query()->where('from_path', '/pages/about')->value('to_path'));
        $this->assertSame('/pages/team', SeoRedirect::query()->where('from_path', '/pages/about-us')->value('to_path'));
        $this->patchJson("/api/v1/builder/pages/$id", ['slug' => 'about'])->assertOk();
        $this->assertNull(SeoRedirect::query()->where('from_path', '/pages/about')->first());

        $this->postJson("/api/v1/builder/pages/$id/unpublish")->assertOk()->assertJsonPath('data.published', false);
        $this->getJson('/api/v1/public/pages/about', ['X-Tenant-Domain' => 'localhost'])->assertNotFound();

        $this->putJson("/api/v1/builder/pages/$id/schedule", ['publish_at' => now()->subMinute()->toIso8601String()])->assertUnprocessable();
        $this->putJson("/api/v1/builder/pages/$id/schedule", ['publish_at' => now()->addMinutes(5)->toIso8601String(), 'unpublish_at' => now()->addMinutes(2)->toIso8601String()])->assertUnprocessable();
        $this->putJson("/api/v1/builder/pages/$id/schedule", ['publish_at' => now()->addMinutes(5)->toIso8601String(), 'unpublish_at' => now()->addHour()->toIso8601String()])->assertOk();
        $this->travel(6)->minutes();
        $this->artisan('builder:scheduled')->assertSuccessful();
        $this->assertTrue((bool) CmsPage::find($id)->published);
        $this->travel(2)->hours();
        $this->artisan('builder:scheduled')->assertSuccessful();
        $this->assertFalse((bool) CmsPage::find($id)->published);
    }

    public function test_preview_token_and_edit_lock(): void
    {
        [$tenant, $admin, $id] = $this->setUpShop();
        $token = $this->postJson("/api/v1/builder/pages/$id/preview-token")->assertOk()->json('data.token');
        $this->getJson('/api/v1/public/builder/preview/'.$token, ['X-Tenant-Domain' => 'localhost'])->assertOk()->assertJsonPath('data.document.sections.0.id', 's1');
        $this->getJson('/api/v1/public/builder/preview/'.$id.'.'.str_repeat('a', 48), ['X-Tenant-Domain' => 'localhost'])->assertNotFound();
        $this->travel(49)->hours();
        $this->getJson('/api/v1/public/builder/preview/'.$token, ['X-Tenant-Domain' => 'localhost'])->assertNotFound();
        $this->travelBack();

        $this->postJson("/api/v1/builder/pages/$id/lock")->assertOk();
        $editor = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'editor', 'name' => 'B']);
        $this->actingAs($editor, 'sanctum');
        $this->postJson("/api/v1/builder/pages/$id/lock")->assertStatus(423)->assertJsonPath('data.locked_by.user_id', $admin->id);
        $this->patchJson("/api/v1/builder/pages/$id", ['title' => 'x'])->assertStatus(423);
        $this->postJson("/api/v1/builder/pages/$id/lock", ['takeover' => true])->assertOk();
        $this->patchJson("/api/v1/builder/pages/$id", ['title' => 'x'])->assertOk();
        $this->actingAs($admin, 'sanctum');
        $this->patchJson("/api/v1/builder/pages/$id", ['title' => 'y'])->assertStatus(423);
        $this->travel(2)->minutes();
        $this->patchJson("/api/v1/builder/pages/$id", ['title' => 'y'])->assertOk();
    }
}
