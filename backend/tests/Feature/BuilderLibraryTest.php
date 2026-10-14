<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_save_list_show_delete_and_tenant_isolation(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'lib-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']), 'sanctum');

        $doc = ['version' => 2, 'sections' => [['id' => 's', 'columns' => []]]];
        $this->postJson('/api/v1/builder/library', ['kind' => 'section', 'title' => '<b>هیرو</b>', 'document' => $doc])->assertCreated();
        $this->postJson('/api/v1/builder/library', ['kind' => 'page', 'title' => 'x', 'document' => ['sections' => []]])->assertUnprocessable();

        $list = $this->getJson('/api/v1/builder/library?kind=section')->assertOk()->json('data');
        $this->assertCount(1, $list);
        $this->assertSame('هیرو', $list[0]['title']);
        $this->assertArrayNotHasKey('document', $list[0]);
        $id = $list[0]['id'];
        $this->getJson("/api/v1/builder/library/$id")->assertOk()->assertJsonPath('data.document.sections.0.id', 's');

        $other = $this->createTenant(['slug' => 'lib-other']);
        $this->enableSubmodule($other->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->getJson("/api/v1/builder/library/$id")->assertNotFound();
        $this->deleteJson("/api/v1/builder/library/$id")->assertNotFound();
        $this->assertCount(0, $this->getJson('/api/v1/builder/library')->json('data'));

        $this->actingAs(User::where('tenant_id', $tenant->id)->first(), 'sanctum');
        $this->deleteJson("/api/v1/builder/library/$id")->assertOk();
    }
}
