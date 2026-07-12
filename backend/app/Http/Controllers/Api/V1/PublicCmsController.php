<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\CmsPage;
use Illuminate\Http\Request;

class PublicCmsController extends Controller
{
    use ResolvesPublicTenant;

    public function page(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $page = CmsPage::query()->where('tenant_id', $tid)->where('slug', $slug)
            ->where('published', true)->firstOrFail();

        return response()->json(['data' => $page]);
    }
}
