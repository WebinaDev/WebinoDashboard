<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;

class HealthController extends Controller
{
    public function readiness(): JsonResponse
    {
        $checks = [
            'database' => $this->checkDatabase(),
            'redis' => $this->checkRedis(),
            'queue' => $this->checkQueue(),
        ];
        $ok = collect($checks)->every(fn (array $c) => $c['ok']);

        return response()->json([
            'data' => [
                'status' => $ok ? 'ready' : 'degraded',
                'checks' => [
                    'database' => $checks['database']['ok'] ? 'ok' : 'fail',
                    'redis' => $checks['redis']['ok'] ? 'ok' : 'fail',
                    'queue' => $checks['queue']['ok'] ? 'ok' : 'fail',
                ],
                'timestamp' => now()->toIso8601String(),
            ],
        ], $ok ? 200 : 503);
    }

    public function metrics(Request $request): JsonResponse
    {
        $token = (string) config('services.health.metrics_token', '');
        $given = (string) ($request->header('X-Health-Token') ?? $request->query('token') ?? '');
        if ($token === '' || $given === '' || ! hash_equals($token, $given)) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json([
            'data' => [
                'app' => config('app.name'),
                'env' => config('app.env'),
                'php' => PHP_VERSION,
                'sapi' => PHP_SAPI,
                'memory_mb' => round(memory_get_usage(true) / 1024 / 1024, 2),
                'pdo_drivers' => \PDO::getAvailableDrivers(),
            ],
        ]);
    }

    /** @return array{ok: bool} */
    private function checkDatabase(): array
    {
        try {
            DB::connection()->getPdo();

            return ['ok' => true];
        } catch (\Throwable) {
            return ['ok' => false];
        }
    }

    /** @return array{ok: bool} */
    private function checkRedis(): array
    {
        try {
            Redis::connection()->ping();

            return ['ok' => true];
        } catch (\Throwable) {
            return ['ok' => false];
        }
    }

    /** @return array{ok: bool} */
    private function checkQueue(): array
    {
        try {
            Queue::size();

            return ['ok' => true];
        } catch (\Throwable) {
            return ['ok' => false];
        }
    }
}
