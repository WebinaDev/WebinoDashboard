<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\MagazineArticle;
use Illuminate\Http\Request;

class PublicMagazineController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = MagazineArticle::query()->where('tenant_id', $tid)->published()
            ->orderByDesc('published_at')
            ->paginate(min(24, max(1, (int) $request->input('per_page', 12))));

        return response()->json($rows);
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $article = MagazineArticle::query()->where('tenant_id', $tid)->where('slug', $slug)
            ->published()->firstOrFail();

        return response()->json(['data' => $article]);
    }
}
