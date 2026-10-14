<?php

namespace Tests\Feature;

use App\Models\BuilderFormSubmission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderFormActionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_actions_are_server_side_validated_and_antispam_drops_bots(): void
    {
        $tenant = $this->createTenant(['slug' => 'form-pro', 'domain' => 'form-pro.test']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']), 'sanctum');

        $this->putJson('/api/v1/builder/forms/contact', ['webhook_url' => 'http://127.0.0.1/hook'])->assertUnprocessable();
        $this->putJson('/api/v1/builder/forms/contact', ['redirect_url' => 'javascript:alert(1)'])->assertUnprocessable();
        $this->putJson('/api/v1/builder/forms/contact', ['email_to' => 'nope'])->assertUnprocessable();
        $this->putJson('/api/v1/builder/forms/contact', ['redirect_url' => '/thanks', 'sms_to' => '09120000000'])
            ->assertOk()->assertJsonPath('data.actions.redirect_url', '/thanks');

        $public = fn (array $extra) => $this->withHeader('X-Tenant-Domain', 'form-pro.test')
            ->postJson('/api/v1/public/forms/submit', ['form_key' => 'contact', 'fields' => ['name' => 'Ali']] + $extra);

        $public(['_hp' => 'http://spam'])->assertOk();
        $public(['_t' => 300])->assertOk();
        $this->assertSame(0, BuilderFormSubmission::query()->count());

        $public(['_t' => 5000])->assertOk()->assertJsonPath('data.redirect', '/thanks');
        $this->assertSame(1, BuilderFormSubmission::query()->count());

        // A client cannot inject actions: unknown keys are ignored.
        $public(['_t' => 5000, 'redirect_url' => 'https://evil.example'])->assertJsonPath('data.redirect', '/thanks');
    }
}
