<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\ProductStory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProductStoryController extends Controller
{
    use ResolvesPublicTenant;

    public function publicIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $now = now();
        $items = ProductStory::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->orderBy('sort_order')
            ->orderByDesc('id')
            ->limit(30)
            ->get(['id', 'title', 'media_url', 'media_type', 'product_id', 'link_url']);

        return response()->json(['data' => ['items' => $items]]);
    }

    public function adminIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $items = ProductStory::query()->where('tenant_id', $tid)->orderBy('sort_order')->get();

        return response()->json(['data' => ['items' => $items]]);
    }

    public function adminStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request);
        $row = ProductStory::query()->create(array_merge($data, ['tenant_id' => $tid]));

        return response()->json(['data' => $row], 201);
    }

    public function adminUpdate(Request $request, ProductStory $story): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $story->tenant_id !== (int) $request->user()->tenant_id, 404);
        $story->update($this->validated($request));

        return response()->json(['data' => $story->fresh()]);
    }

    public function adminDestroy(Request $request, ProductStory $story): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $story->tenant_id !== (int) $request->user()->tenant_id, 404);
        $story->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function adminUploadMedia(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $request->validate([
            'file' => ['required', 'file', 'max:8192', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/webm'],
        ]);
        $file = $request->file('file');
        abort_if($file === null, 422);
        $path = $file->store("stories/{$tid}", 'public');
        $url = Storage::disk('public')->url($path);

        return response()->json(['data' => ['url' => $url, 'media_type' => str_starts_with((string) $file->getMimeType(), 'video/') ? 'video' : 'image']]);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:190'],
            'media_url' => ['required', 'string', 'max:500'],
            'media_type' => ['nullable', 'string', Rule::in(['image', 'video'])],
            'product_id' => ['nullable', 'integer'],
            'link_url' => ['nullable', 'string', 'max:500'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['nullable', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
        ]);
    }
}
