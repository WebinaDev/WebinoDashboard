<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BuilderDesignSystemTest extends TestCase
{
    use RefreshDatabase;

    public function test_design_system_globals_are_normalized(): void
    {
        $tenant = $this->createTenant(['domain' => 'localhost', 'slug' => 'ds-shop']);
        $this->enableSubmodule($tenant->id, 'cms', 'pages');
        $this->actingAs(User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']), 'sanctum');

        $res = $this->putJson('/api/v1/builder/globals', ['settings' => [
            'variables' => [
                ['id' => 'brand', 'name' => 'برند', 'kind' => 'color', 'value' => '#e16ba6'],
                ['id' => 'brand', 'name' => 'dup', 'kind' => 'color', 'value' => '#000'],
                ['id' => 'bad', 'kind' => 'size', 'value' => '1px;}body{x:url(a)'],
                ['id' => 'Bad ID', 'value' => '1px'],
            ],
            'classes' => [['id' => 'card', 'name' => '<b>Card</b>', 'style' => ['base' => ['radius' => '12px'], 'evil' => 1]]],
            'presets' => [['id' => 'cta', 'name' => 'CTA', 'widget' => 'button', 'style' => [], 'props' => ['label' => 'Buy', 'nested' => ['x']]], ['id' => 'p2', 'widget' => 'Bad Widget!']],
            'components' => [['id' => 'hero', 'name' => 'Hero', 'sections' => [['id' => 's1', 'columns' => []]], 'props' => [['key' => 'title', 'label' => 'T', 'widget' => 'w1', 'prop' => 'text'], ['key' => 'bad key!', 'widget' => 'w', 'prop' => 'p']], 'variants' => [['id' => 'dark', 'name' => 'Dark', 'sections' => []]]]],
            'customCode' => [['id' => 'ga', 'name' => 'GA', 'location' => 'head', 'code' => '<script>1</script>', 'enabled' => true, 'paths' => "/shop*\njavascript:x\n/about"]],
        ]])->assertOk();

        $s = $res->json('data.settings');
        $this->assertSame([['id' => 'brand', 'name' => 'برند', 'kind' => 'color', 'value' => '#e16ba6']], $s['variables']);
        $this->assertSame('Card', $s['classes'][0]['name']);
        $this->assertSame(['base' => ['radius' => '12px']], $s['classes'][0]['style']);
        $this->assertCount(1, $s['presets']);
        $this->assertSame(['label' => 'Buy'], $s['presets'][0]['props']);
        $this->assertCount(1, $s['components'][0]['props']);
        $this->assertSame('dark', $s['components'][0]['variants'][0]['id']);
        $this->assertSame("/shop*\n/about", $s['customCode'][0]['paths']);
        $this->assertSame('head', $s['customCode'][0]['location']);
    }
}
