<?php

namespace Tests\Feature;

use App\Models\LinkHubBlock;
use App\Models\LinkHubProfile;
use App\Models\Tenant;
use App\Models\User;
use App\Services\LinkHub\LinkHubTheme;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LinkHubRichBlocksTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected LinkHubProfile $business;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant([
            'slug' => 'richhub',
            'domain' => 'shop.richhub.test',
            'alias_subdomain' => 'contact',
            'domain_aliases' => ['contact.shop.richhub.test'],
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'link-hub.home' => true,
            'link-hub.page' => true,
            'link-hub.profiles' => true,
            'link-hub.inbox' => true,
            'link-hub.settings' => true,
        ]);
        $this->user = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->business = LinkHubProfile::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => LinkHubProfile::KIND_BUSINESS,
            'title' => 'Rich',
            'bio' => "خط اول\nخط دوم",
            'avatar_url' => 'https://cdn.example.test/logo.png',
            'is_published' => true,
            'theme_json' => ['accent' => '#1B6BC4', 'background' => '#eef4fb'],
        ]);
    }

    private function block(string $type, array $payload, int $sort = 0): LinkHubBlock
    {
        return LinkHubBlock::query()->create([
            'tenant_id' => $this->tenant->id,
            'profile_id' => $this->business->id,
            'type' => $type,
            'sort' => $sort,
            'is_visible' => true,
            'payload' => $payload,
        ]);
    }

    private function page(): array
    {
        return $this->withHeader('X-Tenant-Domain', 'contact.shop.richhub.test')
            ->getJson('/api/v1/public/link-hub/page')
            ->assertOk()
            ->json('data');
    }

    public function test_theme_normalize_keeps_legacy_and_fills_defaults(): void
    {
        $theme = LinkHubTheme::normalize(['accent' => '#1B6BC4', 'background' => 'red', 'radius' => 99, 'mode' => 'neon', 'evil' => 1]);

        $this->assertSame('#1b6bc4', $theme['accent']);
        $this->assertArrayNotHasKey('background', $theme);
        $this->assertSame(32, $theme['radius']);
        $this->assertSame('light', $theme['mode']);
        $this->assertSame('yekan-bakh', $theme['font']);
        $this->assertSame('soft', $theme['card_style']);
        $this->assertArrayNotHasKey('evil', $theme);
    }

    public function test_admin_saves_rich_theme_and_new_block_types(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->patchJson("/api/v1/link-hub/profiles/{$this->business->id}", [
                'theme_json' => [
                    'accent' => '#2d4f8f', 'mode' => 'dark', 'font' => 'system', 'hero_gradient' => 'ocean',
                    'card_style' => 'glass', 'radius' => 24, 'kicker' => '<b>کافه</b>', 'headline' => 'تماس',
                    'headline_accent' => 'آبی', 'unknown' => 'x',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.theme_json.mode', 'dark')
            ->assertJsonPath('data.theme_json.kicker', 'کافه')
            ->assertJsonMissingPath('data.theme_json.unknown');

        $types = ['cta', 'section', 'image', 'gallery', 'map', 'hours'];
        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/link-hub/profiles/{$this->business->id}/blocks", [
                'blocks' => array_map(fn ($t, $i) => ['type' => $t, 'sort' => $i, 'payload' => []], $types, array_keys($types)),
            ])
            ->assertOk()
            ->assertJsonCount(6, 'data.blocks');
    }

    public function test_public_page_strips_unsafe_urls_and_empty_blocks(): void
    {
        $this->block('link', ['label' => 'bad', 'url' => 'javascript:alert(1)'], 0);
        $this->block('contact', ['phone' => '021-1', 'socials' => [
            ['label' => 'اینستاگرام', 'url' => 'https://instagram.com/x'],
            ['label' => 'evil', 'url' => 'data:text/html,hi'],
        ]], 1);
        $this->block('cta', ['label' => 'تماس', 'url' => 'tel:0211', 'variant' => 'weird'], 2);
        $this->block('cta', ['label' => 'no url'], 3);
        $this->block('image', ['url' => 'javascript:x'], 4);
        $this->block('gallery', ['images' => [['url' => 'https://img.test/a.jpg', 'alt' => 'a'], ['url' => 'tel:1']]], 5);
        $this->block('map', ['lat' => 'abc', 'lng' => 51], 6);
        $this->block('map', ['lat' => 35.7, 'lng' => 51.4, 'zoom' => 50], 7);
        $this->block('section', ['title' => ''], 8);

        $data = $this->page();
        $types = array_column($data['blocks'], 'type');

        $this->assertSame(['link', 'contact', 'cta', 'gallery', 'map'], $types);
        $this->assertSame('#', $data['blocks'][0]['payload']['url']);
        $this->assertCount(1, $data['blocks'][1]['payload']['socials']);
        $this->assertSame('primary', $data['blocks'][2]['payload']['variant']);
        $this->assertCount(1, $data['blocks'][3]['payload']['images']);
        $this->assertSame(19, $data['blocks'][4]['payload']['zoom']);
        $this->assertSame('#1b6bc4', $data['profile']['theme_json']['accent']);
        $this->assertSame('Rich', $data['seo']['title']);
        $this->assertSame('خط اول خط دوم', $data['seo']['description']);
        $this->assertSame('https://cdn.example.test/logo.png', $data['seo']['image']);
    }

    public function test_hours_block_reads_cafe_settings_and_marks_unknown_days(): void
    {
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'hours', [
            'timezone' => 'Asia/Tehran',
            'days' => [
                ['day' => 'saturday', 'open' => '09:00', 'close' => '23:00', 'closed' => false],
                ['day' => 'tuesday', 'open' => '00:00', 'close' => '00:00', 'closed' => false],
                ['day' => 'friday', 'open' => '09:00', 'close' => '23:00', 'closed' => true],
            ],
            'closed_dates' => [],
        ]);
        $this->block('hours', ['source' => 'cafe', 'days' => [['day' => 'saturday', 'open' => '01:00', 'close' => '02:00']]]);

        $hours = $this->page()['blocks'][0]['payload'];
        $byDay = collect($hours['days'])->keyBy('day');

        $this->assertSame('cafe', $hours['source']);
        $this->assertCount(7, $hours['days']);
        $this->assertSame('09:00', $byDay['saturday']['open']);
        $this->assertFalse($byDay['tuesday']['known']);
        $this->assertTrue($byDay['friday']['closed']);
        $this->assertFalse($byDay['monday']['known']);
    }

    public function test_hours_block_manual_and_empty_is_hidden(): void
    {
        $this->block('hours', ['source' => 'manual', 'days' => []], 0);
        $this->block('hours', ['days' => [['day' => 'monday', 'open' => '10:00', 'close' => '18:00']]], 1);

        $blocks = $this->page()['blocks'];
        $this->assertCount(1, $blocks);
        $this->assertSame('manual', $blocks[0]['payload']['source']);
    }

    public function test_legacy_blocks_still_render(): void
    {
        $this->block('event', ['title' => 'E', 'cta_url' => 'https://e.test'], 0);
        $this->block('faq', ['title' => 'F', 'items' => [['q' => 'a', 'a' => 'b']]], 1);
        $this->block('form', ['title' => 'Hi'], 2);

        $blocks = $this->page()['blocks'];
        $this->assertSame(['event', 'faq', 'form'], array_column($blocks, 'type'));
        $this->assertSame('https://e.test', $blocks[0]['payload']['cta_url']);
        $this->assertCount(3, $blocks[2]['payload']['fields']);
    }
}
