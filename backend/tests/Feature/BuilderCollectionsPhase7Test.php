<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class BuilderCollectionsPhase7Test extends TestCase
{
    use RefreshDatabase;

    private const H = ['X-Tenant-Domain' => 'localhost'];

    private function shop(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'p7-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']), 'sanctum');
    }

    public function test_field_types_references_seo_and_filters(): void
    {
        $this->shop();
        $cities = $this->postJson('/api/v1/builder/collections', ['name' => 'Cities', 'slug' => 'cities', 'fields' => [['key' => 'region', 'label' => 'R', 'type' => 'text']]])->assertCreated()->json('data');
        $this->postJson("/api/v1/builder/collections/{$cities['id']}/items", ['title' => 'تهران', 'slug' => 'tehran'])->assertCreated();
        $this->postJson("/api/v1/builder/collections/{$cities['id']}/items", ['title' => 'شیراز', 'slug' => 'shiraz'])->assertCreated();

        $team = $this->postJson('/api/v1/builder/collections', ['name' => 'Team', 'slug' => 'team', 'fields' => [
            ['key' => 'bio', 'label' => 'Bio', 'type' => 'textarea'],
            ['key' => 'role', 'label' => 'Role', 'type' => 'select', 'options' => "مدیر\nطراح"],
            ['key' => 'active', 'label' => 'Active', 'type' => 'bool'],
            ['key' => 'tint', 'label' => 'Tint', 'type' => 'color'],
            ['key' => 'mail', 'label' => 'Mail', 'type' => 'email'],
            ['key' => 'photos', 'label' => 'Photos', 'type' => 'gallery'],
            ['key' => 'city', 'label' => 'City', 'type' => 'reference', 'collection' => 'cities'],
            ['key' => 'cities', 'label' => 'Cities', 'type' => 'multi_reference', 'collection' => 'cities'],
        ], 'seo' => ['title_template' => '{title} | تیم', 'schema_type' => 'Person']])->assertCreated()->json('data');
        $this->assertSame("مدیر\nطراح", $team['fields'][1]['options']);

        $item = $this->postJson("/api/v1/builder/collections/{$team['id']}/items", ['title' => 'علی', 'slug' => 'ali', 'data' => [
            'bio' => 'برنامه‌نویس ارشد', 'role' => 'هکر', 'active' => true, 'tint' => '#FF0000', 'mail' => 'bad', 'photos' => "/a.jpg\njavascript:x\nhttps://cdn.example/b.jpg",
            'city' => 'tehran', 'cities' => 'tehran, shiraz, <bad>',
        ], 'seo' => ['description' => 'توضیح', 'noindex' => false]])->assertCreated()->json('data');
        $this->assertSame('1', $item['data']['active']);
        $this->assertSame('#ff0000', $item['data']['tint']);
        $this->assertArrayNotHasKey('role', $item['data']);
        $this->assertArrayNotHasKey('mail', $item['data']);
        $this->assertSame("/a.jpg\nhttps://cdn.example/b.jpg", $item['data']['photos']);
        $this->assertSame("tehran\nshiraz", $item['data']['cities']);
        $this->postJson("/api/v1/builder/collections/{$team['id']}/items", ['title' => 'سارا', 'slug' => 'sara', 'data' => ['role' => 'طراح', 'cities' => 'shiraz']])->assertCreated();

        $public = $this->getJson('/api/v1/public/builder/collections/team/items/ali', self::H)->assertOk()->json('data');
        $this->assertSame('تهران', $public['item']['refs']['city'][0]['title']);
        $this->assertCount(2, $public['item']['refs']['cities']);
        $this->assertSame('علی | تیم', $public['seo']['title']);
        $this->assertSame('توضیح', $public['seo']['description']);
        $this->assertSame('Person', $public['seo']['schema_type']);
        $this->assertSame('/a.jpg', $public['seo']['image'] ?? '/a.jpg');

        $this->getJson('/api/v1/public/builder/collections/team/items?filter[role]=طراح', self::H)->assertJsonPath('data.total', 1);
        $this->getJson('/api/v1/public/builder/collections/team/items?filter[cities]=shiraz', self::H)->assertJsonPath('data.total', 2);
        $this->getJson('/api/v1/public/builder/collections/team/items?filter[cities]=tehran|nowhere', self::H)->assertJsonPath('data.total', 1);
        $this->getJson('/api/v1/public/builder/collections/team/items?expand=1&sort=title', self::H)->assertOk()->assertJsonPath('data.items.1.refs.city.0.slug', 'tehran');
    }

    public function test_admin_pagination_bulk_and_csv_round_trip(): void
    {
        $this->shop();
        $c = $this->postJson('/api/v1/builder/collections', ['name' => 'Docs', 'slug' => 'docs', 'fields' => [['key' => 'note', 'label' => 'N', 'type' => 'text'], ['key' => 'n', 'label' => 'N', 'type' => 'number']]])->json('data');
        $csv = "\xEF\xBB\xBFslug,title,published,sort,note,n\nfirst,اول,1,2,=cmd(),5\n,دوم,0,1,سلام,abc\nbad-row,,1,0,x,1\n";
        $this->post("/api/v1/builder/collections/{$c['id']}/import", ['file' => UploadedFile::fake()->createWithContent('docs.csv', $csv)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.created', 2)->assertJsonPath('data.skipped', 1);
        $this->post("/api/v1/builder/collections/{$c['id']}/import", ['file' => UploadedFile::fake()->createWithContent('docs.csv', "slug,title\nfirst,اول ویرایش\n")], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.updated', 1);

        $list = $this->getJson("/api/v1/builder/collections/{$c['id']}/items?per_page=1")->assertOk();
        $this->assertSame(2, $list->json('meta.total'));
        $this->assertCount(1, $list->json('data'));
        $all = $this->getJson("/api/v1/builder/collections/{$c['id']}/items")->json('data');
        $first = collect($all)->firstWhere('slug', 'first');
        $this->assertSame('اول ویرایش', $first['title']);
        $this->assertSame('=cmd()', $first['data']['note']);
        $this->assertSame('5', $first['data']['n']);
        $this->assertArrayNotHasKey('n', collect($all)->firstWhere('title', 'دوم')['data']);

        $export = $this->get("/api/v1/builder/collections/{$c['id']}/export")->assertOk()->streamedContent();
        $this->assertStringContainsString("'=cmd()", $export);
        $this->assertStringContainsString('slug,title,published,sort,note,n', $export);

        $ids = array_column($all, 'id');
        $this->postJson("/api/v1/builder/collections/{$c['id']}/items/bulk", ['ids' => $ids, 'action' => 'publish'])->assertOk()->assertJsonPath('data.affected', 2);
        $this->getJson('/api/v1/public/builder/collections/docs/items', self::H)->assertJsonPath('data.total', 2);
        $this->postJson("/api/v1/builder/collections/{$c['id']}/items/bulk", ['ids' => $ids, 'action' => 'delete'])->assertOk();
        $this->assertSame(0, $this->getJson("/api/v1/builder/collections/{$c['id']}/items")->json('meta.total'));
    }

    public function test_collection_item_template_and_global_queries(): void
    {
        $this->shop();
        $default = $this->postJson('/api/v1/theme-builder/templates', ['kind' => 'collection_item', 'title' => 'All items', 'document' => ['version' => 1, 'sections' => [['id' => 'sec_all', 'columns' => []]]]])->assertCreated()->json('data');
        $this->postJson("/api/v1/theme-builder/templates/{$default['id']}/publish")->assertOk();
        $tpl = $this->postJson('/api/v1/theme-builder/templates', [
            'kind' => 'collection_item', 'title' => 'Team item', 'is_default' => false, 'priority' => 5,
            'conditions' => ['include' => [['type' => 'collection', 'value' => 'team']]],
            'document' => ['version' => 1, 'sections' => [['id' => 'sec_team', 'columns' => []]]],
        ])->assertCreated()->json('data');
        $this->postJson("/api/v1/theme-builder/templates/{$tpl['id']}/publish")->assertOk();
        $this->getJson('/api/v1/public/builder/resolve?kind=collection_item&singular=collection_item&category=team&path=/c/team/ali', self::H)
            ->assertOk()->assertJsonPath('data.document.sections.0.id', 'sec_team');
        $this->getJson('/api/v1/public/builder/resolve?kind=collection_item&singular=collection_item&category=docs&path=/c/docs/x', self::H)
            ->assertOk()->assertJsonPath('data.document.sections.0.id', 'sec_all');

        $s = $this->putJson('/api/v1/builder/globals', ['settings' => ['queries' => [
            ['id' => 'top-team', 'name' => 'Team', 'source' => 'collection', 'collection' => 'team', 'sort' => 'title', 'limit' => 500, 'filters' => [['key' => 'role', 'value' => 'طراح'], ['key' => 'Bad Key', 'value' => 'x']]],
            ['id' => 'Bad Id', 'source' => 'products'],
        ]]])->assertOk()->json('data.settings.queries');
        $this->assertCount(1, $s);
        $this->assertSame(48, $s[0]['limit']);
        $this->assertSame([['key' => 'role', 'value' => 'طراح']], $s[0]['filters']);
    }
}
