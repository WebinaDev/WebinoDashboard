<?php

namespace Tests\Feature;

use App\Models\BuilderRevision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderRevisionsTest extends TestCase
{
    use RefreshDatabase;

    private function doc(string $text): array
    {
        return ['version' => 2, 'sections' => [['id' => 's', 'columns' => [['id' => 'c', 'span' => 12, 'widgets' => [['id' => 'w', 'type' => 'heading', 'props' => ['text' => $text]]]]]]]];
    }

    public function test_save_autosave_collapse_publish_and_restore(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'rev-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');

        $id = $this->postJson('/api/v1/builder/pages', ['title' => 'P', 'slug' => 'p', 'document' => $this->doc('one')])->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/builder/pages/$id", ['document' => $this->doc('two')])->assertOk();
        $this->patchJson("/api/v1/builder/pages/$id", ['document' => $this->doc('auto-a'), 'autosave' => true])->assertOk();
        $this->patchJson("/api/v1/builder/pages/$id", ['document' => $this->doc('auto-b'), 'autosave' => true])->assertOk();
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertOk();

        $list = $this->getJson("/api/v1/builder/revisions?target=page&id=$id")->assertOk()->json('data');
        $this->assertSame(['publish', 'autosave', 'save', 'save'], array_column($list, 'reason'));

        $auto = $this->getJson('/api/v1/builder/revisions/'.$list[1]['id'])->assertOk();
        $this->assertSame('auto-b', $auto->json('data.document.sections.0.columns.0.widgets.0.props.text'));

        $first = end($list)['id'];
        $this->postJson("/api/v1/builder/revisions/$first/restore")->assertOk()
            ->assertJsonPath('data.document.sections.0.columns.0.widgets.0.props.text', 'one');
        $this->getJson("/api/v1/builder/pages/$id")->assertOk();
        $this->assertSame('restore', BuilderRevision::query()->orderByDesc('id')->value('reason'));

        // Other tenants cannot read or restore.
        $other = $this->createTenant(['slug' => 'other-rev']);
        $this->enableSubmodule($other->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->getJson('/api/v1/builder/revisions/'.$first)->assertNotFound();
        $this->postJson("/api/v1/builder/revisions/$first/restore")->assertNotFound();
        $this->getJson("/api/v1/builder/revisions?target=page&id=$id")->assertNotFound();
    }
}
