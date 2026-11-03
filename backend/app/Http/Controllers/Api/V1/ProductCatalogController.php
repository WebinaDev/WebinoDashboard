<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ProductCatalog\ExternalCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * External product database browser + importer (Digikala / Torob / Technolife).
 * Local product CRUD remains on /api/v1/products — this is not a duplicate list API.
 */
class ProductCatalogController extends Controller
{
    public function sources(Request $request): JsonResponse
    {
        $locale = str_starts_with(strtolower((string) $request->query('locale', app()->getLocale())), 'en') ? 'en' : 'fa';
        $svc = new ExternalCatalogService((int) $request->user()->tenant_id);

        return response()->json(['data' => $svc->sourceMeta($locale)]);
    }

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source' => ['required', 'string', 'max:64'],
            'q' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $q = trim((string) ($data['q'] ?? $request->query('q', '')));
        if ($q === '') {
            return response()->json(['message' => __('Enter a search term.')], 422);
        }
        $svc = new ExternalCatalogService((int) $request->user()->tenant_id);
        try {
            $result = $svc->search((string) $data['source'], $q, max(1, (int) ($data['page'] ?? 1)));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }

    public function import(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source' => ['nullable', 'string', 'max:64'],
            'id' => ['nullable', 'string', 'max:128'],
            'remote_id' => ['nullable', 'string', 'max:128'],
            'name' => ['nullable', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:64'],
            'price_minor' => ['nullable', 'integer', 'min:0'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'url' => ['nullable', 'string', 'max:2048'],
            'reference_url' => ['nullable', 'string', 'max:2048'],
            'brand' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:20000'],
            // Legacy quick-import fields (name/sku/price_minor only) still accepted.
        ]);
        if (trim((string) ($data['name'] ?? $data['title'] ?? '')) === '') {
            return response()->json(['message' => __('Product title is required.')], 422);
        }

        $svc = new ExternalCatalogService((int) $request->user()->tenant_id);
        try {
            $result = $svc->import($data);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $result['product'],
            'meta' => ['created' => $result['created']],
        ], $result['created'] ? 201 : 200);
    }
}
