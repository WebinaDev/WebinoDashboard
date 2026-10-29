<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Integrations\InstagramFeedService;
use Illuminate\Http\Request;

class PublicInstagramFeedController extends Controller
{
    public function __invoke(Request $request, InstagramFeedService $feeds): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        if ($tenantId < 1) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        $handle = $request->query('handle');
        $limit = (int) $request->query('limit', 8);
        $payload = $feeds->feed(
            $tenantId,
            is_string($handle) ? $handle : null,
            $limit
        );

        return response()->json([
            'data' => $payload['items'],
            'meta' => [
                'configured' => $payload['configured'],
                'handle' => $payload['handle'],
                'profile_url' => $payload['profile_url'],
                'message' => $payload['message'],
            ],
        ]);
    }
}
