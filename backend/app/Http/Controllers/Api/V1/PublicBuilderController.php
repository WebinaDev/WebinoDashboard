<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicBuilderController extends Controller
{
    use ResolvesPublicTenant;

    public function page(Request $request, string $slug): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $page = CmsPage::query()
            ->where('tenant_id', $tid)
            ->where('slug', $slug)
            ->where('published', true)
            ->firstOrFail();

        abort_unless(is_array($page->builder_published), 404);

        return response()->json([
            'data' => [
                'slug' => $page->slug,
                'title' => $page->title,
                'document' => $page->builder_published,
            ],
        ]);
    }

    public function template(Request $request, string $kind): JsonResponse
    {
        abort_unless(in_array($kind, ['header', 'footer'], true), 404);
        $tid = $this->publicTenantId($request);
        $row = BuilderTemplate::query()
            ->where('tenant_id', $tid)
            ->where('kind', $kind)
            ->first();

        abort_unless($row && is_array($row->published), 404);

        return response()->json([
            'data' => [
                'kind' => $row->kind,
                'title' => $row->title,
                'document' => $row->published,
            ],
        ]);
    }
}
