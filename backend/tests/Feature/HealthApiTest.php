<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_metrics_endpoint(): void
    {
        $this->getJson('/api/v1/health/metrics')
            ->assertOk()
            ->assertJsonStructure(['data' => ['app', 'env', 'php']]);
    }

    public function test_readiness_endpoint_returns_json(): void
    {
        $response = $this->getJson('/api/v1/health/readiness');
        $response->assertJsonStructure(['data' => ['status', 'checks', 'timestamp']]);
    }
}
