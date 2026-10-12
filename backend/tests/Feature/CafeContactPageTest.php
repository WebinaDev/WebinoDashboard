<?php

namespace Tests\Feature;

use App\Models\LinkHubBlock;
use App\Models\LinkHubProfile;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CafeContactPageTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant(['domain' => 'contact-cafe.test', 'slug' => 'contact-cafe']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true, 'cafe.venue' => true]);
        $this->h = ['X-Tenant-Domain' => $this->tenant->domain];
    }

    private function venue(array $over): void
    {
        $s = app(ModuleSettingsService::class);
        $s->put($this->tenant->id, 'cafe', 'venue', array_merge(ModuleSettingsService::cafeVenueDefaults(), $over));
    }

    public function test_contact_page_is_off_by_default(): void
    {
        $this->assertFalse(ModuleSettingsService::cafeVenueDefaults()['contact_page_enabled']);
        $this->getJson('/api/v1/public/cafe/contact', $this->h)->assertNotFound();
        $this->assertFalse((bool) $this->getJson('/api/v1/public/cafe/venue', $this->h)->json('data.venue.contact_page_enabled'));
    }

    public function test_artisan_toggle_targets_one_tenant_only(): void
    {
        $other = $this->createTenant(['domain' => 'other-cafe.test', 'slug' => 'other-cafe']);
        $this->artisan('cafe:contact-page', ['tenant' => 'contact-cafe.test'])->assertSuccessful();
        $s = app(ModuleSettingsService::class);
        $this->assertTrue($s->get($this->tenant->id, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults())['contact_page_enabled']);
        $this->assertFalse($s->get($other->id, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults())['contact_page_enabled']);

        $this->artisan('cafe:contact-page', ['tenant' => 'contact-cafe', '--disable' => true])->assertSuccessful();
        $this->getJson('/api/v1/public/cafe/contact', $this->h)->assertNotFound();
        $this->artisan('cafe:contact-page', ['tenant' => 'nope'])->assertFailed();
    }

    public function test_payload_merges_link_hub_and_venue_and_is_not_cached(): void
    {
        $this->venue(['contact_page_enabled' => true, 'phone' => '02155550000', 'address_fa' => 'تهران، خیابان آبی', 'tagline_fa' => 'آرامش']);
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'menu', array_merge(ModuleSettingsService::cafeMenuDefaults(), ['cafe_lat' => 35.7, 'cafe_lng' => 51.4]));
        app(ModuleSettingsService::class)->put($this->tenant->id, 'cafe', 'hours', ['timezone' => 'Asia/Tehran', 'days' => [['day' => 'saturday', 'open' => '09:00', 'close' => '23:00']], 'closed_dates' => []]);
        $this->enableSubmodules($this->tenant->id, ['link-hub.page' => true, 'link-hub.home' => true]);
        $profile = LinkHubProfile::query()->create(['tenant_id' => $this->tenant->id, 'kind' => LinkHubProfile::KIND_BUSINESS, 'title' => 'Blue', 'is_published' => true]);
        LinkHubBlock::query()->create(['tenant_id' => $this->tenant->id, 'profile_id' => $profile->id, 'type' => 'contact', 'sort' => 0, 'is_visible' => true,
            'payload' => ['phone' => '', 'email' => 'hi@blue.test', 'whatsapp' => 'https://wa.me/989121111111', 'socials' => [['label' => 'Instagram', 'url' => 'https://instagram.com/blue']]]]);
        LinkHubBlock::query()->create(['tenant_id' => $this->tenant->id, 'profile_id' => $profile->id, 'type' => 'link', 'sort' => 1, 'is_visible' => true, 'payload' => ['label' => 'Menu', 'url' => 'https://blue.test/catalogue']]);
        LinkHubBlock::query()->create(['tenant_id' => $this->tenant->id, 'profile_id' => $profile->id, 'type' => 'link', 'sort' => 2, 'is_visible' => false, 'payload' => ['label' => 'Hidden', 'url' => 'https://x.test']]);
        $form = LinkHubBlock::query()->create(['tenant_id' => $this->tenant->id, 'profile_id' => $profile->id, 'type' => 'form', 'sort' => 3, 'is_visible' => true, 'payload' => ['title' => 'پیام']]);

        $res = $this->getJson('/api/v1/public/cafe/contact', $this->h)->assertOk();
        $this->assertStringContainsString('no-store', (string) $res->headers->get('Cache-Control'));
        $d = $res->json('data');
        $this->assertSame('02155550000', $d['contact']['phone']); // venue fills the empty link-hub phone
        $this->assertSame('hi@blue.test', $d['contact']['email']);
        $this->assertSame('https://wa.me/989121111111', $d['contact']['whatsapp']);
        $this->assertSame('تهران، خیابان آبی', $d['contact']['address_fa']);
        $this->assertSame(['lat' => 35.7, 'lng' => 51.4], $d['location']);
        $this->assertCount(1, $d['links']);
        $this->assertSame($form->id, $d['form']['id']);
        $this->assertCount(1, $d['hours']['days']);

        // Venue edits show at once.
        $this->venue(['contact_page_enabled' => true, 'phone' => '02166660000']);
        $this->assertSame('02166660000', $this->getJson('/api/v1/public/cafe/contact', $this->h)->json('data.contact.phone'));

        // Contact form: required fields enforced, unknown fields dropped.
        $this->postJson("/api/v1/public/link-hub/forms/{$form->id}/submit", ['fields' => ['name' => 'Ali']], $this->h)->assertStatus(422);
        $this->postJson("/api/v1/public/link-hub/forms/{$form->id}/submit", ['fields' => ['name' => 'Ali', 'phone' => '09121111111', 'evil' => 'x']], $this->h)->assertCreated();
        $row = \App\Models\LinkHubFormSubmission::query()->latest('id')->first();
        $this->assertArrayNotHasKey('evil', $row->payload);
    }
}
