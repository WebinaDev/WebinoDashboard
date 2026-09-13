<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\ResumeProfile;
use Illuminate\Http\Request;

class PublicResumeController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $profile = ResumeProfile::query()->where('tenant_id', $tid)->published()->firstOrFail();

        return response()->json(['data' => $profile]);
    }
}
