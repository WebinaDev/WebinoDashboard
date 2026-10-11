<?php

namespace Tests\Feature;

use App\Models\LinkHubBlock;
use App\Models\LinkHubFormSubmission;
use App\Models\LinkHubProfile;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LinkHubTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->createTenant([
            'slug' => 'linkhub',
            'domain' => 'shop.linkhub.test',
            'alias_subdomain' => 'contact',
            'domain_aliases' => ['contact.shop.linkhub.test'],
        ]);
        $this->enableSubmodules($this->tenant->id, [
            'link-hub.home' => true,
            'link-hub.page' => true,
            'link-hub.profiles' => true,
            'link-hub.inbox' => true,
            'link-hub.settings' => true,
        ]);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);
    }

    public function test_tenant_resolver_matches_domain_alias(): void
    {
        $resolver = app(TenantResolver::class);
        $found = $resolver->findByHost('contact.shop.linkhub.test');
        $this->assertNotNull($found);
        $this->assertSame($this->tenant->id, $found->id);
    }

    public function test_host_mode_reports_link_hub_on_alias(): void
    {
        $this->withHeader('X-Tenant-Domain', 'contact.shop.linkhub.test')
            ->getJson('/api/v1/public/link-hub/host-mode')
            ->assertOk()
            ->assertJsonPath('data.host_mode', 'link-hub');

        $this->withHeader('X-Tenant-Domain', 'shop.linkhub.test')
            ->getJson('/api/v1/public/link-hub/host-mode')
            ->assertOk()
            ->assertJsonPath('data.host_mode', 'primary');
    }

    public function test_admin_can_manage_business_blocks_and_member_slug(): void
    {
        $overview = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/link-hub/overview')
            ->assertOk()
            ->json('data');

        $businessId = (int) $overview['business']['id'];
        $this->assertGreaterThan(0, $businessId);

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/link-hub/profiles/{$businessId}/blocks", [
                'blocks' => [
                    [
                        'type' => 'link',
                        'sort' => 0,
                        'is_visible' => true,
                        'payload' => ['label' => 'Instagram', 'url' => 'https://instagram.com/x'],
                    ],
                    [
                        'type' => 'form',
                        'sort' => 1,
                        'is_visible' => true,
                        'payload' => ['title' => 'Contact'],
                    ],
                ],
            ])
            ->assertOk();

        $this->assertSame(2, LinkHubBlock::query()->where('profile_id', $businessId)->count());

        $member = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/link-hub/profiles', [
                'title' => 'Amir',
                'slug' => 'amir',
                'is_published' => true,
            ])
            ->assertCreated()
            ->json('data');

        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/link-hub/profiles', [
                'title' => 'Dup',
                'slug' => 'amir',
            ])
            ->assertStatus(422);

        $this->assertSame('amir', $member['slug']);
    }

    public function test_public_page_and_form_submit(): void
    {
        $business = LinkHubProfile::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => LinkHubProfile::KIND_BUSINESS,
            'title' => 'Shop',
            'is_published' => true,
        ]);
        $block = LinkHubBlock::query()->create([
            'tenant_id' => $this->tenant->id,
            'profile_id' => $business->id,
            'type' => 'form',
            'sort' => 0,
            'is_visible' => true,
            'payload' => ['title' => 'Hi'],
        ]);

        LinkHubProfile::query()->create([
            'tenant_id' => $this->tenant->id,
            'kind' => LinkHubProfile::KIND_MEMBER,
            'slug' => 'sara',
            'title' => 'Sara',
            'is_published' => true,
        ]);

        $this->withHeader('X-Tenant-Domain', 'contact.shop.linkhub.test')
            ->getJson('/api/v1/public/link-hub/page')
            ->assertOk()
            ->assertJsonPath('data.profile.kind', 'business');

        $this->withHeader('X-Tenant-Domain', 'contact.shop.linkhub.test')
            ->getJson('/api/v1/public/link-hub/page?slug=sara')
            ->assertOk()
            ->assertJsonPath('data.profile.slug', 'sara');

        $this->withHeader('X-Tenant-Domain', 'contact.shop.linkhub.test')
            ->postJson("/api/v1/public/link-hub/forms/{$block->id}/submit", [
                'fields' => ['name' => 'Ali', 'phone' => '0912'],
            ])
            ->assertCreated();

        $this->assertSame(1, LinkHubFormSubmission::query()->where('tenant_id', $this->tenant->id)->count());
    }

    public function test_settings_update_alias_locally(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->putJson('/api/v1/link-hub/settings', [
                'alias_subdomain' => 'bio',
            ])
            ->assertOk()
            ->assertJsonPath('data.alias_subdomain', 'bio')
            ->assertJsonPath('data.alias_hostname', 'bio.shop.linkhub.test');

        $this->tenant->refresh();
        $this->assertSame('bio', $this->tenant->alias_subdomain);
        $this->assertContains('bio.shop.linkhub.test', $this->tenant->normalizedDomainAliases());
    }
}
