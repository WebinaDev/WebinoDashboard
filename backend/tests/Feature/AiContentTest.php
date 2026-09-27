<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AiContent\AiCalendar;
use App\Services\AiContent\AiContentSettings;
use App\Services\AiContent\AiProposals;
use App\Services\AiContent\AiQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiContentTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::query()->create([
            'name' => 'Shop', 'slug' => 'shop', 'domain' => 'shop.test', 'license_key' => 'k',
            'setup_completed' => true, 'store_display_name' => 'Shop', 'default_currency' => 'IRR',
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'ai-content.studio' => true,
            'commerce.catalog' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->actingAs($this->user, 'sanctum');
    }

    public function test_settings_mask_api_keys(): void
    {
        AiContentSettings::save($this->tenant->id, [
            'enabled' => true,
            'openai_api_key' => 'sk-test-secret-key-12345678',
            'default_provider' => 'openai',
        ]);

        $data = $this->getJson('/api/v1/ai-content/settings')->assertOk()->json('data');
        $this->assertArrayNotHasKey('daily_salt', $data);
        $this->assertTrue($data['openai_api_key_set']);
        $this->assertStringContainsString('*', (string) $data['openai_api_key']);
        $this->assertStringNotContainsString('sk-test-secret', (string) $data['openai_api_key']);

        $viaTenant = $this->getJson('/api/v1/settings/site/ai')->assertOk()->json('data');
        $this->assertTrue($viaTenant['openai_api_key_set']);
        $this->assertStringContainsString('*', (string) $viaTenant['openai_api_key']);
    }

    public function test_generate_rejected_without_api_key(): void
    {
        AiContentSettings::save($this->tenant->id, ['enabled' => true, 'openai_api_key' => '']);
        $p = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'P', 'slug' => 'p',
            'price_minor' => 1000, 'currency' => 'IRR', 'status' => 'publish', 'is_available' => true,
        ]);

        $this->postJson('/api/v1/ai-content/generate', [
            'type' => 'product', 'id' => $p->id,
        ])->assertStatus(422);
    }

    public function test_generate_product_fills_description_from_fake_provider(): void
    {
        AiContentSettings::save($this->tenant->id, [
            'enabled' => true,
            'default_provider' => 'openai',
            'openai_api_key' => 'sk-live-fake-key-abcdefgh',
            'min_product_words' => 5,
        ]);

        $p = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Espresso', 'slug' => 'espresso',
            'price_minor' => 100000, 'currency' => 'IRR', 'status' => 'publish', 'is_available' => true,
            'description' => '', 'short_description' => '',
        ]);

        $payload = json_encode([
            'name' => 'Espresso',
            'short_description' => '<p>Short tasty coffee beans for espresso lovers.</p>',
            'description' => '<p>'.str_repeat('Rich aroma and balanced body. ', 20).'</p>',
            'focus_keyword' => 'espresso',
            'faqs' => [['question' => 'Q?', 'answer' => 'A']],
            'ai_review_summary' => 'Great reviews',
            'related_product_ids' => [],
            'internal_links' => [['anchor' => 'home', 'url' => '/']],
        ], JSON_UNESCAPED_UNICODE);

        Http::fake([
            'api.openai.com/*' => Http::response([
                'choices' => [['message' => ['content' => $payload]]],
                'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 20],
            ], 200),
        ]);

        $this->postJson('/api/v1/ai-content/generate', [
            'type' => 'product', 'id' => $p->id, 'sync' => true,
        ])->assertOk()->assertJsonPath('data.queued', false);

        $p->refresh();
        $this->assertNotSame('', (string) $p->description);
        $this->assertStringContainsString('Rich aroma', (string) $p->description);
        $this->assertSame('Great reviews', $p->ai_review_summary);
    }

    public function test_calendar_due_creates_job(): void
    {
        AiContentSettings::save($this->tenant->id, [
            'enabled' => true,
            'openai_api_key' => 'sk-live-fake-key-abcdefgh',
            'default_provider' => 'openai',
        ]);

        $slot = app(AiCalendar::class)->create($this->tenant->id, [
            'slot_date' => now()->subDay()->toDateString(),
            'content_type' => 'blog',
            'topic' => 'Coffee tips',
            'focus_keyword' => 'coffee',
        ]);

        $n = app(AiCalendar::class)->runDue($this->tenant->id);
        $this->assertSame(1, $n);

        $fresh = DB::table('ai_calendar')->where('id', $slot['id'])->first();
        $this->assertSame('queued', $fresh->status);
        $this->assertGreaterThan(0, (int) $fresh->job_id);
        $this->assertSame(1, DB::table('ai_jobs')->where('tenant_id', $this->tenant->id)->count());
    }

    public function test_proposal_apply_writes_related_ids(): void
    {
        $a = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'A', 'slug' => 'a',
            'price_minor' => 1, 'currency' => 'IRR', 'status' => 'publish', 'is_available' => true,
        ]);
        $b = Product::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'B', 'slug' => 'b',
            'price_minor' => 1, 'currency' => 'IRR', 'status' => 'publish', 'is_available' => true,
        ]);

        $id = DB::table('ai_proposals')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'kind' => 'related',
            'product_id' => $a->id,
            'current_json' => json_encode(['related_ids' => []]),
            'proposed_json' => json_encode(['related_ids' => [$b->id]]),
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertTrue(app(AiProposals::class)->apply($this->tenant->id, $id));
        $a->refresh();
        $this->assertSame([$b->id], array_map('intval', $a->related_ids ?? []));
    }
}
