<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\CmsPage;
use App\Services\Builder\ThemeRequestContext;
use App\Services\Builder\ThemeTemplateKinds;
use App\Services\Builder\ThemeTemplateResolver;
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
        return $this->resolved($request, $kind, new ThemeRequestContext);
    }

    public function resolve(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => 'required|string|max:32',
            'path' => 'nullable|string|max:500',
            'singular' => 'nullable|string|max:32',
            'archive' => 'nullable|string|max:32',
            'search' => 'nullable|boolean',
            'not_found' => 'nullable|boolean',
        ]);

        return $this->resolved($request, $data['kind'], ThemeRequestContext::fromArray($data));
    }

    private function resolved(Request $request, string $kind, ThemeRequestContext $context): JsonResponse
    {
        abort_unless(ThemeTemplateKinds::is($kind), 404);
        $row = app(ThemeTemplateResolver::class)->resolve($this->publicTenantId($request), $kind, $context);
        abort_unless($row && is_array($row->published), 404);

        return response()->json([
            'data' => [
                'id' => $row->id,
                'kind' => $row->kind,
                'title' => $row->title,
                'is_default' => (bool) $row->is_default,
                'document' => $row->published,
            ],
        ]);
    }
}
