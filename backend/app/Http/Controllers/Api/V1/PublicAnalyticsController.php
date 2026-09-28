<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Analytics\AnalyticsSettings;
use App\Services\Analytics\AnalyticsTracker;
use Illuminate\Http\Request;

class PublicAnalyticsController extends Controller
{
    public function bootstrap(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        if (! AnalyticsSettings::trackingEnabled($tenantId)) {
            return response()->json(['data' => ['tracking_enabled' => false]]);
        }
        $settings = AnalyticsSettings::get($tenantId);
        $skip = AnalyticsTracker::userSkipReason($tenantId, auth('sanctum')->user()) !== null;

        return response()->json([
            'data' => [
                'tracking_enabled' => true,
                'hit_token' => (string) $settings['hit_token'],
                'endpoint' => url('/api/v1/public/analytics/hit'),
                'skip' => $skip,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function hit(Request $request, AnalyticsTracker $tracker): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        $token = (string) (
            $request->header('X-Analytics-Token')
            ?: $request->header('X-Webino-Analytics-Token')
            ?: $request->query('token', '')
            ?: $request->input('hit_token', '')
            ?: $request->input('token', '')
        );
        $expected = (string) (AnalyticsSettings::get($tenantId)['hit_token'] ?? '');
        if ($expected === '' || ! hash_equals($expected, $token)) {
            return response()->json(['message' => 'Invalid analytics token'], 403);
        }

        $payload = $request->validate([
            'type' => ['nullable', 'string', 'in:'.implode(',', AnalyticsTracker::EVENT_TYPES)],
            'uri' => ['nullable', 'string', 'max:512'],
            'referrer' => ['nullable', 'string', 'max:512'],
            'post_id' => ['nullable', 'integer', 'min:0'],
            'session_id' => ['nullable', 'string', 'max:64'],
            'utm_source' => ['nullable', 'string', 'max:100'],
            'utm_medium' => ['nullable', 'string', 'max:100'],
            'utm_campaign' => ['nullable', 'string', 'max:100'],
            'duration_ms' => ['nullable', 'integer', 'min:0'],
            'page_count' => ['nullable', 'integer', 'min:1'],
            'is_exit' => ['nullable', 'boolean'],
            'title' => ['nullable', 'string', 'max:255'],
        ]);

        $result = $tracker->record($tenantId, $payload, $request);
        if (! ($result['ok'] ?? false)) {
            return response()->json(['message' => $result['skipped'] ?? 'error'], $result['status'] ?? 400);
        }

        return response()->json(['data' => ['ok' => true, 'skipped' => $result['skipped'] ?? null]]);
    }
}
