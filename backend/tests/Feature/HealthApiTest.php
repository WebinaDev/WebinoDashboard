<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_metrics_endpoint(): void
    {
        config(['services.health.metrics_token' => 'metrics-test-token']);

        $this->getJson('/api/v1/health/metrics')->assertNotFound();

        $this->getJson('/api/v1/health/metrics', ['X-Health-Token' => 'metrics-test-token'])
            ->assertOk()
            ->assertJsonStructure(['data' => ['app', 'env', 'php']]);
    }

    public function test_readiness_endpoint_returns_json(): void
    {
        $response = $this->getJson('/api/v1/health/readiness');
        $response->assertJsonStructure(['data' => ['status', 'checks', 'timestamp']]);
    }
}
