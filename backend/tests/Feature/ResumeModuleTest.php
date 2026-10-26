<?php

namespace Tests\Feature;

use App\Models\CmsPage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Resume\Jalali;
use App\Services\Resume\ResumeDate;
use App\Services\Resume\ResumeImporter;
use App\Services\Resume\ResumeSchema;
use App\Services\Resume\ResumeScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ResumeModuleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create(['name' => 'R', 'slug' => 't-resume', 'domain' => 'localhost', 'setup_completed' => true]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->enableSubmodule($this->tenant->id, 'resume', 'profile');
    }

    protected function tearDown(): void
    {
        ResumeScope::set(null);
        parent::tearDown();
    }

    public function test_jalali_conversion_round_trips(): void
    {
        $this->assertSame([1403, 1, 1], Jalali::toJalali(2024, 3, 20));
        $this->assertSame([2024, 3, 20], Jalali::toGregorian(1403, 1, 1));
        $this->assertSame([1399, 12, 30], Jalali::toJalali(2021, 3, 20));
        $d = ResumeDate::normalize(['j' => '1398-07', 'precision' => 'month']);
        $this->assertSame(['g' => '2019-09', 'j' => '1398-07', 'precision' => 'month'], $d);
    }

    public function test_every_schema_section_has_a_model_and_table(): void
    {
        foreach (ResumeSchema::sections() as $slug => $s) {
            $class = ResumeSchema::model($slug);
            $this->assertTrue(class_exists($class), $class);
            $this->assertSame($s['table'], (new $class)->getTable());
        }
        $this->assertGreaterThanOrEqual(15, count(ResumeSchema::sections()));
    }

    public function test_crud_reorder_validation_and_tenant_isolation(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $a = $this->postJson('/api/v1/resume/experiences', [
            'title_fa' => 'توسعه‌دهنده', 'title_en' => 'Developer', 'company_fa' => 'وبینا', 'employment_type' => 'full_time',
            'start' => ['j' => '1398-07', 'precision' => 'month'], 'is_current' => true,
        ])->assertCreated()->assertJsonPath('data.start.g', '2019-09')->json('data.id');
        $b = $this->postJson('/api/v1/resume/experiences', ['title_en' => 'Intern'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/resume/experiences', ['company_fa' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['title_fa']);
        $this->postJson('/api/v1/resume/experiences', ['title_fa' => 'x', 'employment_type' => 'boss'])->assertStatus(422);
        $this->postJson('/api/v1/resume/experiences', ['title_fa' => 'x', 'media_ids' => [999999]])->assertStatus(422);
        $this->postJson('/api/v1/resume/nope', [])->assertNotFound();

        $this->postJson('/api/v1/resume/experiences/reorder', ['ids' => [$b, $a]])->assertOk()->assertJsonPath('data.0.id', $b);
        $this->putJson("/api/v1/resume/experiences/{$a}", ['visibility' => 'hidden'])->assertOk()->assertJsonPath('data.visibility', 'hidden');

        $this->putJson('/api/v1/resume/identity', ['full_name_fa' => 'آرسلان ارغوان', 'full_name_en' => 'Arsalan Arghavan', 'birth_date' => ['g' => '1990-01-01']])->assertOk();
        $this->putJson('/api/v1/resume/settings', ['theme_key' => 'aurora-glass', 'default_lang' => 'fa'])->assertOk()->assertJsonPath('data.theme_key', 'aurora-glass');
        $this->putJson('/api/v1/resume/settings', ['theme_key' => 'nope'])->assertStatus(422);

        $pub = $this->getJson('/api/v1/public/resume/full')->assertOk();
        $pub->assertJsonCount(1, 'data.experiences')->assertJsonPath('data.experiences.0.title_en', 'Intern')
            ->assertJsonPath('data.identity.full_name_en', 'Arsalan Arghavan')->assertJsonPath('data.theme.key', 'aurora-glass');
        $this->assertArrayNotHasKey('birth_date', $pub->json('data.identity'));

        $other = Tenant::query()->create(['name' => 'O', 'slug' => 'o-resume', 'domain' => 'other.test', 'setup_completed' => true]);
        $this->enableSubmodule($other->id, 'resume', 'profile');
        $this->actingAs(User::factory()->create(['tenant_id' => $other->id, 'role' => 'admin']), 'sanctum');
        $this->getJson('/api/v1/resume/experiences')->assertOk()->assertJsonCount(0, 'data');
        $this->putJson("/api/v1/resume/experiences/{$a}", ['title_fa' => 'hack'])->assertNotFound();
        $this->deleteJson("/api/v1/resume/experiences/{$a}")->assertNotFound();
    }

    public function test_module_must_be_enabled_and_auth_required(): void
    {
        $this->getJson('/api/v1/resume/experiences')->assertUnauthorized();
        $t = Tenant::query()->create(['name' => 'N', 'slug' => 'n-resume', 'domain' => 'n.test', 'setup_completed' => true]);
        $this->actingAs(User::factory()->create(['tenant_id' => $t->id, 'role' => 'admin']), 'sanctum');
        $this->getJson('/api/v1/resume/experiences')->assertForbidden();
    }

    public function test_import_data_json_and_apply_theme_layout_with_backup(): void
    {
        $payload = json_decode((string) file_get_contents(__DIR__.'/../fixtures/resume-data.json'), true);
        $report = ResumeImporter::import($this->tenant->id, $payload, true);
        $this->assertGreaterThan(0, $report['experiences']);
        ResumeScope::set($this->tenant->id);
        $exp = \App\Models\Resume\ResumeExperience::query()->orderBy('order')->first();
        $this->assertNotEmpty($exp->skill_ids);
        $this->assertNotEmpty(\App\Models\Resume\ResumeIdentity::query()->first()->full_name_fa);

        $this->actingAs($this->user, 'sanctum');
        CmsPage::query()->create(['tenant_id' => $this->tenant->id, 'slug' => 'home', 'title' => 'Old', 'published' => true,
            'builder_published' => ['version' => 2, 'sections' => [['id' => 'old', 'columns' => []]]]]);
        $this->postJson('/api/v1/resume/theme/apply', ['theme_key' => 'atelier-editorial'])->assertOk()->assertJsonCount(2, 'data.pages');
        $home = CmsPage::query()->where('slug', 'home')->first();
        $en = CmsPage::query()->where('slug', 'en')->first();
        $this->assertSame('fa', $home->lang);
        $this->assertSame('en', $en->lang);
        $this->assertSame($home->translation_group, $en->translation_group);
        $this->assertSame('resume.lang_switch', $home->builder_published['sections'][0]['columns'][0]['widgets'][0]['type']);
        $this->assertSame('resume.hero', $home->builder_published['sections'][1]['columns'][0]['widgets'][0]['type']);
        $this->assertTrue(\App\Models\BuilderRevision::query()->where('target_id', $home->id)->where('reason', 'resume-theme')
            ->get()->contains(fn ($r) => ($r->document['sections'][0]['id'] ?? null) === 'old'));
    }

    public function test_site_seed_with_media_files_and_full_page_theme(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        $dir = base_path('../deploy/sites/arsalanarghavan.ir/resume');
        $json = json_decode((string) file_get_contents($dir.'/resume.json'), true);
        ResumeImporter::import($this->tenant->id, $json, true, $dir);
        ResumeScope::set($this->tenant->id);
        $idn = \App\Models\Resume\ResumeIdentity::query()->first();
        $this->assertNotNull($idn->avatar_media_id);
        $this->assertNotNull($idn->cover_media_id);
        $this->assertSame('story', \App\Models\Resume\ResumeSetting::query()->first()->theme_key);
        $this->assertSame('#e8502a', \App\Models\Resume\ResumeSetting::query()->first()->accent);

        $this->actingAs($this->user, 'sanctum');
        $this->postJson('/api/v1/resume/theme/apply', ['theme_key' => 'story'])->assertOk();
        $home = CmsPage::query()->where('slug', 'home')->first();
        $this->assertCount(1, $home->builder_published['sections']);
        $this->assertSame('resume.page_story', $home->builder_published['sections'][0]['columns'][0]['widgets'][0]['type']);
        $pub = $this->getJson('/api/v1/public/resume/full')->assertOk();
        $this->assertArrayHasKey((string) $idn->cover_media_id, $pub->json('data.media'));
    }

    public function test_site_language_setting(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $this->putJson('/api/v1/settings/site-language', ['default_locale' => 'en'])->assertOk()->assertJsonPath('data.dir', 'ltr');
        $this->putJson('/api/v1/settings/site-language', ['default_locale' => 'de'])->assertStatus(422);
        $this->getJson('/api/v1/public/site-language')->assertOk()->assertJsonPath('data.default_locale', 'en');
    }
}
