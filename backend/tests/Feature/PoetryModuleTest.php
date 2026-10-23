<?php

namespace Tests\Feature;

use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Poetry\PoetryImportParser;
use App\Services\Poetry\PoetryScope;
use App\Services\Poetry\PoetryTaxonomy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PoetryModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = Tenant::query()->create(['name' => 'T', 'slug' => 't-poetry', 'domain' => 'localhost', 'setup_completed' => true]);
        $this->user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        PoetryTaxonomy::ensure($tenant->id);
        PoetryScope::set($tenant->id);
    }

    protected function tearDown(): void
    {
        PoetryScope::set(null);
        parent::tearDown();
    }

    private function term(string $kind, string $slug): int
    {
        return PoetryTerm::query()->where('kind', $kind)->where('slug', $slug)->value('id');
    }

    public function test_taxonomies_are_seeded_per_tenant_without_poems(): void
    {
        $this->assertSame(0, PoetryPoem::query()->count());
        $this->assertSame(6, PoetryTerm::query()->where('kind', 'occasion')->count());
        $this->assertSame(10, PoetryTerm::query()->where('kind', 'style')->count());
        foreach (['امام حسین', 'امام حسن مجتبی', 'حضرت قاسم', 'کاروان اسرا'] as $name) {
            $this->assertTrue(PoetryTerm::query()->where('kind', 'figure')->where('name', $name)->exists(), $name);
        }
        $this->getJson('/api/v1/public/poetry/terms?kind=occasion')->assertOk()->assertJsonCount(6, 'data');
    }

    public function test_other_tenant_cannot_see_poems(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $id = $this->postJson('/api/v1/poetry/poems', ['title' => 'الف', 'status' => 'published', 'stanzas' => [['type' => 'stanza', 'lines' => ['a', 'b']]]])->assertCreated()->json('data.id');
        $other = Tenant::query()->create(['name' => 'O', 'slug' => 'o-poetry', 'domain' => 'other.test', 'setup_completed' => true]);
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->getJson('/api/v1/poetry/poems')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson("/api/v1/poetry/poems/{$id}")->assertNotFound();
        $this->deleteJson("/api/v1/poetry/poems/{$id}")->assertNotFound();
        $this->assertSame(1, PoetryPoem::withoutGlobalScopes()->count());
    }

    public function test_admin_crud_public_detail_search_related_and_text(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $payload = [
            'title' => 'شب عاشورا', 'status' => 'published', 'occasion_id' => $this->term('occasion', 'muharram'),
            'term_ids' => [$this->term('figure', 'imam-hossein'), $this->term('style', 'noheh')],
            'pen_name' => 'طه', 'composed_label' => 'خرداد ۱۳۹۸', 'refrain_after_each' => true,
            'external_links' => [['label' => 'ایتا', 'url' => 'https://eitaa.com/x/1']],
            'stanzas' => [
                ['type' => 'refrain', 'repeat' => 2, 'lines' => ['حسین جان', 'ای جان جانان']],
                ['type' => 'stanza', 'lines' => ['مصراع اول بند يك', 'مصراع دوم بند']],
                ['type' => 'stanza', 'lines' => ['بند دوم سطر اول', 'بند دوم سطر دوم']],
            ],
        ];
        $id = $this->postJson('/api/v1/poetry/poems', $payload)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/poetry/poems', ['title' => 'دیگر', 'status' => 'published', 'term_ids' => [$this->term('figure', 'imam-hossein')], 'stanzas' => [['type' => 'stanza', 'lines' => ['x', 'y']]]])->assertCreated();
        $this->postJson('/api/v1/poetry/poems', ['title' => 'پیش‌نویس', 'stanzas' => [['type' => 'stanza', 'lines' => ['z']]]])->assertCreated();
        $this->postJson('/api/v1/poetry/poems', ['title' => 'بد', 'external_links' => [['url' => 'javascript:alert(1)']], 'stanzas' => [['type' => 'stanza', 'lines' => ['a']]]])->assertStatus(422);

        $slug = PoetryPoem::withoutGlobalScopes()->find($id)->slug;
        $res = $this->getJson("/api/v1/public/poetry/poems/{$slug}")->assertOk();
        $res->assertJsonPath('data.pen_name', 'طه')->assertJsonPath('data.figures.0.slug', 'imam-hossein')->assertJsonPath('data.view_count', 1);
        // refrain auto-inserted after each stanza: refrain, s1, refrain, s2, refrain
        $this->assertSame(['refrain', 'stanza', 'refrain', 'stanza', 'refrain'], array_column($res->json('data.sequence'), 'type'));
        $this->assertSame('دیگر', $res->json('data.related.0.title'));

        // verse-line search with Arabic ي/ك normalised
        $this->getJson('/api/v1/public/poetry/poems?q='.urlencode('بند یک'))->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/public/poetry/poems?figure=imam-hossein')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/public/poetry/poems?style=noheh&occasion=muharram')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/public/poetry/poems')->assertJsonPath('meta.total', 2); // draft hidden
        $this->getJson('/api/v1/public/poetry/figures/imam-hossein')->assertOk()->assertJsonPath('data.figure.name', 'امام حسین')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/public/poetry/poems?has_media=1')->assertJsonPath('meta.total', 1);
        $terms = collect($this->getJson('/api/v1/public/poetry/terms')->json('data'))->keyBy(fn ($t) => $t['kind'].':'.$t['slug']);
        $this->assertSame(2, $terms['figure:imam-hossein']['count']);
        $this->assertSame(1, $terms['occasion:muharram']['count']);
        $this->getJson('/api/v1/public/poetry/popular')->assertOk()->assertJsonPath('data.0.slug', $slug);

        $text = $this->get("/api/v1/public/poetry/poems/{$slug}/text")->assertOk();
        $this->assertStringContainsString('attachment', $text->headers->get('Content-Disposition'));
        $this->assertSame(3, substr_count($text->getContent(), 'حسین جان'));

        $this->putJson("/api/v1/poetry/poems/{$id}", ['refrain_after_each' => false])->assertOk();
        $this->assertCount(3, $this->getJson("/api/v1/public/poetry/poems/{$slug}")->json('data.sequence'));
    }

    public function test_admin_requires_auth(): void
    {
        PoetryScope::set(null);
        $this->getJson('/api/v1/poetry/poems')->assertUnauthorized();
        $this->postJson('/api/v1/poetry/import/parse', ['text' => 'x'])->assertUnauthorized();
    }

    public function test_import_parser_handles_telegram_format(): void
    {
        $raw = <<<'TXT'
═══ ✾ ═══
🏴 نوحه زنجیرزنی حماسی
#جدید
خوانده نشده
تیتر: ما ادری
تیتر
یا حسین یا حسین
...
برگردان:
ای کربلا ای کربلا
عشق منی ای کربلا x2
...
بند اول مصراع یک
بند اول مصراع دو
...
بند دوم مصراع یک
بند دوم مصراع دو
...
#طه
خرداد ۱۳۹۸
🆔 @ali_khabari_poet
TXT;
        $r = (new PoetryImportParser)->parse($raw);
        $this->assertSame('نوحه زنجیرزنی حماسی', $r['style_label']);
        $this->assertSame('تیتر: ما ادری', $r['melody_credit']);
        $this->assertTrue($r['flags']['is_new']);
        $this->assertTrue($r['flags']['not_performed']);
        $this->assertSame('طه', $r['pen_name']);
        $this->assertSame('خرداد ۱۳۹۸', $r['composed_label']);
        $this->assertSame(['title', 'refrain', 'stanza', 'stanza'], array_column($r['stanzas'], 'type'));
        $this->assertSame(2, $r['stanzas'][1]['repeat']);
        $this->assertSame(['ای کربلا ای کربلا', 'عشق منی ای کربلا'], $r['stanzas'][1]['lines']);
        $this->assertSame('یا حسین یا حسین', $r['title']);
        $this->assertStringNotContainsString('ali_khabari', json_encode($r, JSON_UNESCAPED_UNICODE));
    }
}
