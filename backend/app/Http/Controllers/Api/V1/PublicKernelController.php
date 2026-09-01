<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\TenantActivationService;
use Illuminate\Http\Request;

class PublicKernelController extends Controller
{
    public function activations(Request $request, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        $tenantId = $request->attributes->get('public_tenant_id');
        if (! $tenantId) {
            return response()->json(['message' => __('api.tenant_not_found')], 404);
        }

        return response()->json([
            'data' => [
                'activations' => $activations->activationsForTenant((int) $tenantId),
            ],
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }
}
