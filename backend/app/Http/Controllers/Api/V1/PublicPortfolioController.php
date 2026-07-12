<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\PortfolioItem;
use Illuminate\Http\Request;

class PublicPortfolioController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $rows = PortfolioItem::query()->where('tenant_id', $tid)->published()
            ->orderByDesc('published_at')->paginate(12);

        return response()->json($rows);
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $item = PortfolioItem::query()->where('tenant_id', $tid)->where('slug', $slug)
            ->published()->firstOrFail();

        return response()->json(['data' => $item]);
    }
}
