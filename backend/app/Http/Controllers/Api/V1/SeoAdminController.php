<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Seo\SeoRedirectService;
use App\Services\Seo\SeoSettingsService;
use Illuminate\Http\Request;

class SeoAdminController extends Controller
{
    public function settings(Request $request, SeoSettingsService $seo): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => $seo->get($tid)]);
    }

    public function saveSettings(Request $request, SeoSettingsService $seo): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'separator' => ['sometimes', 'string', 'max:8'],
            'title_template' => ['sometimes', 'string', 'max:120'],
            'home_title' => ['sometimes', 'nullable', 'string', 'max:200'],
            'home_description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'og_image' => ['sometimes', 'nullable', 'string', 'max:500'],
            'twitter_card' => ['sometimes', 'string', 'max:40'],
            'organization_name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'organization_logo' => ['sometimes', 'nullable', 'string', 'max:500'],
            'organization_same_as' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'robots_default' => ['sometimes', 'string', 'max:80'],
            'noindex_search' => ['sometimes', 'boolean'],
            'noindex_archives' => ['sometimes', 'boolean'],
            'sitemap_enabled' => ['sometimes', 'boolean'],
            'sitemap_include_products' => ['sometimes', 'boolean'],
            'sitemap_include_posts' => ['sometimes', 'boolean'],
            'sitemap_include_pages' => ['sometimes', 'boolean'],
            'sitemap_include_news' => ['sometimes', 'boolean'],
            'sitemap_include_videos' => ['sometimes', 'boolean'],
            'news_publication_name' => ['sometimes', 'nullable', 'string', 'max:200'],
            'news_language' => ['sometimes', 'string', 'max:12'],
            'schema_organization_enabled' => ['sometimes', 'boolean'],
            'schema_website_enabled' => ['sometimes', 'boolean'],
            'canonical_force_https' => ['sometimes', 'boolean'],
            'redirect_trailing_slash' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['data' => $seo->save($tid, $data)]);
    }

    public function redirects(Request $request, SeoRedirectService $redirects): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => $redirects->list($tid)]);
    }

    public function storeRedirect(Request $request, SeoRedirectService $redirects): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'from_path' => ['required', 'string', 'max:512'],
            'to_path' => ['required', 'string', 'max:512'],
            'status_code' => ['sometimes', 'integer', 'in:301,302,307,308'],
            'enabled' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        try {
            $row = $redirects->upsert($tid, $data);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $row], 201);
    }

    public function updateRedirect(Request $request, int $id, SeoRedirectService $redirects): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'from_path' => ['sometimes', 'string', 'max:512'],
            'to_path' => ['sometimes', 'string', 'max:512'],
            'status_code' => ['sometimes', 'integer', 'in:301,302,307,308'],
            'enabled' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $existing = $redirects->list($tid)->firstWhere('id', $id);
        abort_if($existing === null, 404);
        $merged = array_merge($existing->toArray(), $data);
        try {
            $row = $redirects->upsert($tid, $merged, $id);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $row]);
    }

    public function destroyRedirect(Request $request, int $id, SeoRedirectService $redirects): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $redirects->delete($tid, $id);

        return response()->json(['ok' => true]);
    }
}
