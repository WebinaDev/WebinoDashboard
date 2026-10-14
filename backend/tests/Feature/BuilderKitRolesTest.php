<?php

namespace Tests\Feature;

use App\Models\CmsPage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderKitRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_kit_export_import_roundtrip(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'kit-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']), 'sanctum');

        $this->putJson('/api/v1/builder/globals', ['settings' => [
            'customFonts' => [['family' => 'Shabnam', 'url' => 'https://cdn.example.com/Shabnam.woff2', 'weight' => '700'], ['family' => 'Bad', 'url' => 'javascript:alert(1)']],
            'breakpoints' => ['tablet' => 900, 'mobile' => 5000],
        ]])->assertOk()
            ->assertJsonCount(1, 'data.settings.customFonts')
            ->assertJsonPath('data.settings.breakpoints.tablet', 900)
            ->assertJsonPath('data.settings.breakpoints.mobile', 899);
        $this->postJson('/api/v1/builder/pages', ['title' => 'خانه', 'slug' => 'home', 'document' => [
            'version' => 2, 'sections' => [],
            'compiled' => ['v' => 2, 'bp' => '900/899', 'hash' => 'abc', 'css' => '.a{}</style><script>x</script>'],
        ]])->assertCreated()->assertJsonPath('data.document.compiled.css', '.a{}/style>script>x/script>');
        $this->postJson('/api/v1/builder/library', ['kind' => 'section', 'title' => 'هیرو', 'document' => ['version' => 2, 'sections' => [['id' => 's', 'columns' => []]]]])->assertCreated();

        $kit = $this->getJson('/api/v1/builder/kit')->assertOk()->json('data');
        $this->assertSame('webino-kit', $kit['format']);
        $this->assertCount(1, $kit['pages']);

        $other = $this->createTenant(['slug' => 'kit-other']);
        $this->enableSubmodule($other->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->postJson('/api/v1/builder/kit', ['kit' => $kit])->assertOk()
            ->assertJsonPath('data.imported.pages', 1)
            ->assertJsonPath('data.imported.library', 1)
            ->assertJsonPath('data.imported.globals', 1);
        $this->postJson('/api/v1/builder/kit', ['kit' => $kit, 'parts' => ['pages']])->assertOk();
        $this->assertSame(['home', 'home-2'], CmsPage::query()->where('tenant_id', $other->id)->orderBy('id')->pluck('slug')->all());
        $this->assertFalse((bool) CmsPage::query()->where('tenant_id', $other->id)->first()->published);
        $this->postJson('/api/v1/builder/kit', ['kit' => ['format' => 'nope']])->assertUnprocessable();
    }

    public function test_role_policies_gate_publish_and_design(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'roles-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $editor = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'editor']);

        $this->actingAs($admin, 'sanctum');
        $id = $this->postJson('/api/v1/builder/pages', ['title' => 'P', 'document' => ['version' => 2, 'sections' => []]])->json('data.id');
        $this->putJson('/api/v1/builder/roles', ['roles' => [['role' => 'editor', 'can_edit' => true, 'can_publish' => false, 'can_design' => false]]])
            ->assertOk()->assertJsonPath('data.roles.5.can_publish', false);

        $this->actingAs($editor, 'sanctum');
        $this->getJson('/api/v1/builder/roles')->assertOk()->assertJsonPath('data.me.publish', false)->assertJsonPath('data.can_manage', false);
        $this->patchJson("/api/v1/builder/pages/$id", ['title' => 'P2'])->assertOk();
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertForbidden();
        $this->putJson('/api/v1/builder/globals', ['settings' => []])->assertForbidden();
        $this->getJson('/api/v1/builder/kit')->assertForbidden();
        $this->putJson('/api/v1/builder/roles', ['roles' => []])->assertForbidden();

        $this->actingAs($admin, 'sanctum');
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertOk();
    }
}
