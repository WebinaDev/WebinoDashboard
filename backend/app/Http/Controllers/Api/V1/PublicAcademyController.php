<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\AcademyCourse;
use Illuminate\Http\Request;

class PublicAcademyController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = AcademyCourse::query()->where('tenant_id', $tid)->published()
            ->orderBy('sort_order')->paginate(12);

        return response()->json($rows);
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $course = AcademyCourse::query()->where('tenant_id', $tid)->where('slug', $slug)
            ->published()->with(['lessons' => fn ($q) => $q->where('published', true)])->firstOrFail();

        return response()->json(['data' => $course]);
    }
}
