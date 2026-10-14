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

        // Explicit public fields only (meta holds edit locks / preview token hashes).
        return response()->json(['data' => [
            'id' => $page->id,
            'slug' => $page->slug,
            'title' => $page->title,
            'excerpt' => $page->excerpt,
            'body' => $page->body,
            'builder_published' => $page->builder_published,
            'ab' => BuilderAbController::publicPayload($page),
            'featured_media_id' => $page->featured_media_id,
            'parent_id' => $page->parent_id,
            'seo' => $page->seo,
            'lang' => $page->lang,
            'visibility' => $page->visibility,
            'comment_status' => $page->comment_status,
            'published' => (bool) $page->published,
            'status' => $page->status,
            'created_at' => $page->created_at,
            'updated_at' => $page->updated_at,
        ]]);
    }
}
