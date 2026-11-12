<?php

namespace Tests\Feature;

use App\Models\Poetry\PoetryMedia;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Membership\MembershipService;
use App\Services\Poetry\PoetryScope;
use App\Services\Poetry\PoetryTaxonomy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Poetry books (collections), highlights and the occasions hub: admin CRUD, public reads, premium lock, tenant isolation. */
class PoetryBooksHighlightsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'books.test', 'slug' => 'books']);
        $this->admin = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
        PoetryTaxonomy::ensure($this->tenant->id);
        PoetryScope::set($this->tenant->id);
    }

    protected function tearDown(): void
    {
        PoetryScope::set(null);
        parent::tearDown();
    }

    private function poem(string $slug, array $extra = []): PoetryPoem
    {
        $p = PoetryPoem::query()->create(array_merge(['slug' => $slug, 'title' => $slug, 'status' => 'published'], $extra));
        $p->stanzas()->create(['position' => 0, 'type' => 'stanza', 'lines' => ['الف', 'ب']]);

        return $p;
    }

    public function test_books_admin_crud_and_public_list_detail(): void
    {
        $a = $this->poem('a');
        $b = $this->poem('b');
        $draft = $this->poem('c', ['status' => 'draft']);
        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/poetry/books', ['title' => 'x', 'poem_ids' => [99999]], $this->h)->assertStatus(422)->assertJsonValidationErrors('poem_ids');
        $book = $this->postJson('/api/v1/poetry/books', ['title' => 'دیوان نخست', 'description' => 'گزیده', 'cover' => '/storage/book.webp',
            'cta_label' => 'خبرم کن', 'poem_ids' => [$b->id, $a->id, $draft->id]], $this->h)->assertCreated()->json('data');
        $this->assertSame([$b->id, $a->id, $draft->id], $book['poem_ids']);
        $this->putJson('/api/v1/poetry/books/'.$book['id'], ['subtitle' => 'جلد ۱'], $this->h)->assertOk()->assertJsonPath('data.subtitle', 'جلد ۱');
        $this->getJson('/api/v1/poetry/books', $this->h)->assertOk()->assertJsonPath('data.0.poems_count', 3);

        auth()->forgetGuards();
        $list = $this->getJson('/api/v1/public/poetry/books', $this->h)->assertOk()->json('data');
        $this->assertSame('دیوان نخست', $list[0]['title']);
        $this->assertSame(2, $list[0]['poems_count']);
        $detail = $this->getJson('/api/v1/public/poetry/books/'.$book['slug'], $this->h)->assertOk()->json('data');
        $this->assertSame(['b', 'a'], array_column($detail['poems'], 'slug'));
        $this->assertFalse($detail['locked']);

        // Premium book: titles stay, poems are locked for visitors.
        $this->actingAs($this->admin, 'sanctum');
        $this->putJson('/api/v1/poetry/books/'.$book['id'], ['is_premium' => true], $this->h)->assertOk();
        auth()->forgetGuards();
        $detail = $this->getJson('/api/v1/public/poetry/books/'.$book['slug'], $this->h)->assertOk()->json('data');
        $this->assertTrue($detail['locked']);
        $this->assertTrue($detail['poems'][0]['locked']);

        // Other tenants do not see it.
        $other = $this->createTenant(['domain' => 'other.test', 'slug' => 'other']);
        $this->getJson('/api/v1/public/poetry/books', ['X-Tenant-Domain' => $other->domain])->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($this->admin, 'sanctum');
        $this->deleteJson('/api/v1/poetry/books/'.$book['id'], [], $this->h)->assertOk();
        $this->assertNotNull($a->fresh());
    }

    public function test_highlights_admin_crud_public_order_and_premium_lock(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->postJson('/api/v1/poetry/highlights', ['title' => 'خالی', 'kind' => 'video'], $this->h)->assertStatus(422);
        $this->postJson('/api/v1/poetry/highlights', ['title' => 'بد', 'kind' => 'gif', 'file_url' => '/storage/a.mp4'], $this->h)->assertStatus(422);
        $v = $this->postJson('/api/v1/poetry/highlights', ['title' => 'محرم', 'kind' => 'video', 'file_url' => '/storage/h.mp4', 'cover' => '/storage/h.webp', 'sort' => 2], $this->h)
            ->assertCreated()->json('data');
        $this->postJson('/api/v1/poetry/highlights', ['title' => 'اطلاعیه', 'kind' => 'image', 'file_url' => '/storage/i.webp', 'link_url' => '/shop', 'sort' => 1], $this->h)->assertCreated();
        $vip = $this->postJson('/api/v1/poetry/highlights', ['title' => 'ویژه', 'kind' => 'video', 'external_url' => 'https://www.aparat.com/v/xyz', 'is_premium' => true, 'sort' => 3], $this->h)
            ->assertCreated()->json('data');
        $this->postJson('/api/v1/poetry/highlights', ['title' => 'پیش‌نویس', 'kind' => 'image', 'file_url' => '/storage/d.webp', 'status' => 'draft'], $this->h)->assertCreated();
        $this->putJson('/api/v1/poetry/highlights/'.$v['id'], ['title' => 'محرم ۱۴۰۵'], $this->h)->assertOk()->assertJsonPath('data.title', 'محرم ۱۴۰۵');

        auth()->forgetGuards();
        $rows = $this->getJson('/api/v1/public/poetry/highlights', $this->h)->assertOk()->json('data');
        $this->assertSame(['اطلاعیه', 'محرم ۱۴۰۵', 'ویژه'], array_column($rows, 'title'));
        $this->assertSame('/storage/i.webp', $rows[0]['cover']);
        $this->assertTrue($rows[2]['locked']);
        $this->assertNull($rows[2]['external_url']);
        $this->assertNull($rows[2]['embed_url']);

        $member = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'customer']);
        app(MembershipService::class)->grant($member, 1, 'month');
        $this->actingAs($member->fresh(), 'sanctum');
        $rows = $this->getJson('/api/v1/public/poetry/highlights', $this->h)->json('data');
        $this->assertFalse($rows[2]['locked']);
        $this->assertSame('https://www.aparat.com/video/video/embed/videohash/xyz/vt/frame', $rows[2]['embed_url']);

        $this->actingAs($this->admin, 'sanctum');
        $this->deleteJson('/api/v1/poetry/highlights/'.$vip['id'], [], $this->h)->assertOk();
        $this->assertCount(3, $this->getJson('/api/v1/poetry/highlights', $this->h)->json('data'));
    }

    public function test_occasions_hub_lists_counts_and_one_occasion(): void
    {
        $occ = PoetryTerm::query()->where('kind', 'occasion')->orderBy('id')->firstOrFail();
        $this->poem('m1', ['occasion_id' => $occ->id]);
        $this->poem('m2', ['occasion_id' => $occ->id, 'is_premium' => true]);
        $this->poem('m3', ['occasion_id' => $occ->id, 'status' => 'draft']);
        PoetryMedia::query()->create(['title' => 'نوحه', 'kind' => 'audio', 'file_url' => '/storage/n.mp3', 'occasion_id' => $occ->id]);

        $list = collect($this->getJson('/api/v1/public/poetry/occasions', $this->h)->assertOk()->json('data'))->keyBy('slug');
        $this->assertSame(2, $list[$occ->slug]['poems_count']);
        $this->assertSame(1, $list[$occ->slug]['media_count']);

        $one = $this->getJson('/api/v1/public/poetry/occasions/'.$occ->slug, $this->h)->assertOk()->json();
        $this->assertSame($occ->slug, $one['data']['occasion']['slug']);
        $this->assertCount(2, $one['data']['poems']);
        $this->assertSame(2, $one['meta']['total']);
        $this->assertTrue(collect($one['data']['poems'])->firstWhere('slug', 'm2')['locked']);
        $this->assertSame('/storage/n.mp3', $one['data']['media'][0]['url']);
        $this->getJson('/api/v1/public/poetry/occasions/nope', $this->h)->assertNotFound();
    }

    public function test_short_flag_filter_is_applied(): void
    {
        $this->poem('short', ['flags' => ['is_short' => true]]);
        $this->poem('long');
        $this->assertSame(['short'], array_column($this->getJson('/api/v1/public/poetry/poems?flag=is_short', $this->h)->assertOk()->json('data'), 'slug'));
    }
}
