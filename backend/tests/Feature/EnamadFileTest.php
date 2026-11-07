<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EnamadFileTest extends TestCase
{
    use RefreshDatabase;

    public function test_saved_code_publishes_an_empty_public_file_and_rejects_others(): void
    {
        $tenant = Tenant::query()->create([
            'name' => 'Shop',
            'slug' => 'shop',
            'domain' => 'shop.test',
            'license_key' => 'k',
            'provision_token' => 'site-token',
            'setup_completed' => true,
            'default_currency' => 'IRT',
        ]);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($user, 'sanctum');

        $this->putJson('/api/v1/settings/site/general', [
            'payload' => [
                'site_title' => 'فروشگاه',
                'tagline' => '',
                'admin_email' => 'owner@shop.test',
                'timezone' => 'Asia/Tehran',
                'enamad_file' => '4534534.txt',
            ],
        ])->assertOk()->assertJsonPath('data.enamad_file', '4534534');

        $this->getJson('/api/v1/settings/site/general')
            ->assertOk()
            ->assertJsonPath('data.enamad_file', '4534534');

        $ok = $this->withHeader('Host', 'shop.test')->get('/api/v1/public/enamad/4534534');
        $ok->assertOk();
        $ok->assertHeader('Content-Type', 'text/plain; charset=UTF-8');
        $this->assertSame('', $ok->getContent());

        $this->withHeader('Host', 'shop.test')->get('/api/v1/public/enamad/999999')->assertNotFound();

        $this->putJson('/api/v1/settings/site/general', [
            'payload' => ['site_title' => 'فروشگاه', 'enamad_file' => 'not a file'],
        ])->assertOk()->assertJsonPath('data.enamad_file', '');

        $this->withHeader('Host', 'shop.test')->get('/api/v1/public/enamad/4534534')->assertNotFound();
    }
}
