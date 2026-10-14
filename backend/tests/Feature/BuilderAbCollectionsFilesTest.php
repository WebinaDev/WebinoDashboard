<?php

namespace Tests\Feature;

use App\Models\BuilderFormFile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BuilderAbCollectionsFilesTest extends TestCase
{
    use RefreshDatabase;

    private const H = ['X-Tenant-Domain' => 'localhost'];

    private function shop(): array
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'abc-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($admin, 'sanctum');

        return [$tenant, $admin];
    }

    private function page(string $slug, string $section): int
    {
        $id = $this->postJson('/api/v1/builder/pages', ['title' => $slug, 'slug' => $slug, 'document' => ['version' => 2, 'sections' => [['id' => $section, 'columns' => []]]]])->json('data.id');
        $this->postJson("/api/v1/builder/pages/$id/publish")->assertOk();

        return $id;
    }

    public function test_ab_test_setup_public_payload_events_and_results(): void
    {
        $this->shop();
        $a = $this->page('landing', 'A');
        $b = $this->page('landing-b', 'B');
        $this->putJson("/api/v1/builder/pages/$a/ab", ['variant_page_id' => $a, 'split' => 50, 'status' => 'running'])->assertUnprocessable();
        $test = $this->putJson("/api/v1/builder/pages/$a/ab", ['variant_page_id' => $b, 'split' => 30, 'status' => 'running'])->assertOk()->json('data');

        $public = $this->getJson('/api/v1/public/pages/landing', self::H)->assertOk()->json('data.ab');
        $this->assertSame(30, $public['split']);
        $this->assertSame('B', $public['variant']['document']['sections'][0]['id']);

        $this->postJson("/api/v1/public/builder/ab/{$test['id']}/event", ['variant' => 'a', 'type' => 'view'], self::H)->assertOk();
        $this->postJson("/api/v1/public/builder/ab/{$test['id']}/event", ['variant' => 'b', 'type' => 'view'], self::H)->assertOk();
        $this->postJson("/api/v1/public/builder/ab/{$test['id']}/event", ['variant' => 'b', 'type' => 'conversion'], self::H)->assertOk();
        $this->postJson("/api/v1/public/builder/ab/{$test['id']}/event", ['variant' => 'c', 'type' => 'view'], self::H)->assertUnprocessable();
        $this->getJson("/api/v1/builder/pages/$a/ab")->assertOk()
            ->assertJsonPath('data.views_a', 1)->assertJsonPath('data.views_b', 1)->assertJsonPath('data.conversions_b', 1)
            ->assertJsonPath('data.significant', false);

        $this->putJson("/api/v1/builder/pages/$a/ab", ['variant_page_id' => $b, 'split' => 30, 'status' => 'paused'])->assertOk();
        $this->assertNull($this->getJson('/api/v1/public/pages/landing', self::H)->json('data.ab'));
        $this->deleteJson("/api/v1/builder/pages/$a/ab")->assertOk();
        $this->assertNull($this->getJson("/api/v1/builder/pages/$a/ab")->assertOk()->json('data.id'));
    }

    public function test_collections_crud_public_listing_and_sanitising(): void
    {
        $this->shop();
        $c = $this->postJson('/api/v1/builder/collections', ['name' => 'تیم', 'fields' => [
            ['key' => 'role', 'label' => 'سمت', 'type' => 'text'],
            ['key' => 'photo', 'label' => 'عکس', 'type' => 'image'],
            ['key' => 'age', 'label' => 'سن', 'type' => 'number'],
        ]])->assertCreated()->json('data');
        $this->postJson('/api/v1/builder/collections', ['name' => 'x', 'fields' => [['key' => 'Bad Key', 'label' => 'x', 'type' => 'text']]])->assertUnprocessable();

        $this->postJson("/api/v1/builder/collections/{$c['id']}/items", ['title' => 'علی', 'data' => ['role' => '<b>مدیر</b>', 'photo' => 'javascript:alert(1)', 'age' => 'abc', 'extra' => 'x'], 'sort' => 2])
            ->assertCreated()->assertJsonPath('data.data.role', 'مدیر')->assertJsonMissingPath('data.data.photo')->assertJsonMissingPath('data.data.extra');
        $this->postJson("/api/v1/builder/collections/{$c['id']}/items", ['title' => 'علی', 'slug' => 'ali', 'data' => ['photo' => '/media/a.jpg'], 'sort' => 1])->assertCreated();
        $this->postJson("/api/v1/builder/collections/{$c['id']}/items", ['title' => 'Draft', 'published' => false])->assertCreated();

        $list = $this->getJson("/api/v1/public/builder/collections/{$c['slug']}/items?limit=10", self::H)->assertOk()->json('data');
        $this->assertSame(2, $list['total']);
        $this->assertSame('ali', $list['items'][0]['slug']);
        $this->getJson("/api/v1/public/builder/collections/{$c['slug']}/items/ali", self::H)->assertOk()->assertJsonPath('data.item.data.photo', '/media/a.jpg');
        $this->getJson("/api/v1/public/builder/collections/{$c['slug']}/items/draft", self::H)->assertNotFound();

        $other = $this->createTenant(['slug' => 'abc-other']);
        $this->enableSubmodule($other->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->getJson("/api/v1/builder/collections/{$c['id']}/items")->assertNotFound();
    }

    public function test_form_file_upload_claim_inbox_and_download(): void
    {
        Storage::fake('local');
        [$tenant] = $this->shop();
        $this->postJson('/api/v1/public/builder/forms/upload', ['file' => UploadedFile::fake()->create('evil.php', 10, 'application/x-php'), 'form_key' => 'job'], self::H)->assertUnprocessable();
        $up = $this->post('/api/v1/public/builder/forms/upload', ['file' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf'), 'form_key' => 'job'], self::H + ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->assertMatchesRegularExpression('/^upl_[a-f0-9]{40}$/', $up['token']);

        $this->postJson('/api/v1/public/forms/submit', ['form_key' => 'job', 'fields' => ['name' => 'سارا', 'cv' => $up['token'], 'fake' => 'upl_'.str_repeat('a', 40)], '_t' => 5000], self::H)->assertOk();
        $inbox = $this->getJson('/api/v1/builder/forms/job/submissions')->assertOk()->json('data');
        $this->assertSame('📎 cv.pdf', $inbox[0]['payload']['cv']);
        $this->assertSame('', $inbox[0]['payload']['fake']);
        $fileId = $inbox[0]['files'][0]['id'];
        $this->get("/api/v1/builder/forms/files/$fileId")->assertOk()->assertHeader('content-disposition');

        // A token can only be claimed once.
        $this->postJson('/api/v1/public/forms/submit', ['form_key' => 'job', 'fields' => ['cv' => $up['token']], '_t' => 5000], self::H)->assertOk();
        $this->assertSame(1, BuilderFormFile::query()->whereNotNull('submission_id')->count());
        $this->assertSame('', $this->getJson('/api/v1/builder/forms/job/submissions')->json('data.0.payload.cv'));
    }
}
