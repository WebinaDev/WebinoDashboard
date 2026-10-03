<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProductTag;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductTagController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = ProductTag::query()->where('tenant_id', $tid)->withCount('products');
        \App\Support\StatusTrash::apply($q, $request->filled('status') ? (string) $request->query('status') : null);

        if ($search = $request->query('search')) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('slug', 'like', $like);
            });
        }

        $items = $q->orderBy('name')->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
        ]);

        $slug = $this->ensureUniqueSlug($tid, $data['slug'] ?? Str::slug($data['name']));

        $tag = ProductTag::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'slug' => $slug,
        ]);

        return response()->json(['data' => $tag->loadCount('products')], 201);
    }

    public function update(Request $request, ProductTag $productTag): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $productTag->tenant_id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255'],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->ensureUniqueSlug($productTag->tenant_id, $data['slug'], $productTag->id);
        }

        $productTag->update($data);

        return response()->json(['data' => $productTag->fresh()->loadCount('products')]);
    }

    public function destroy(Request $request, ProductTag $productTag): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $productTag->tenant_id);

        return response()->json(['data' => \App\Support\StatusTrash::trashOrDelete($productTag, $request->boolean('force'), 'status', 'publish', ['publish'])]);
    }

    public function restore(Request $request, ProductTag $productTag): \Illuminate\Http\JsonResponse
    {
        $this->authorizeTenant($request, $productTag->tenant_id);
        $status = \App\Support\StatusTrash::restore($productTag, 'status', 'publish', ['publish']);

        return response()->json(['data' => $productTag->fresh(), 'restored_status' => $status]);
    }

    protected function authorizeTenant(Request $request, int $tenantId): void
    {
        abort_if($request->user()->tenant_id !== $tenantId, 403);
    }

    private function ensureUniqueSlug(int $tenantId, string $slug, ?int $exceptId = null): string
    {
        $base = $slug !== '' ? $slug : 'tag';
        $candidate = $base;
        $i = 1;
        while (
            ProductTag::query()
                ->where('tenant_id', $tenantId)
                ->where('slug', $candidate)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->exists()
        ) {
            $candidate = $base.'-'.$i;
            $i++;
        }

        return $candidate;
    }
}
