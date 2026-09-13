<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MagazineArticle;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MagazineArticleController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = MagazineArticle::query()->where('tenant_id', $tid)
            ->orderByDesc('id')
            ->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $this->validated($request);
        $tid = $request->user()->tenant_id;
        $slug = $data['slug'] ?? Str::slug($data['title']);
        if (($data['status'] ?? null) === 'published' && empty($data['published_at'])) {
            $data['published_at'] = now();
        }

        $row = MagazineArticle::query()->create([
            'tenant_id' => $tid,
            'slug' => $slug,
            ...$data,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $article): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MagazineArticle::query()->where('tenant_id', $tid)->findOrFail($article);
        $data = $this->validated($request, partial: true);
        if (($data['status'] ?? null) === 'published' && empty($data['published_at']) && ! $row->published_at) {
            $data['published_at'] = now();
        }
        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(Request $request, int $article): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        MagazineArticle::query()->where('tenant_id', $tid)->where('id', $article)->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validated(Request $request, bool $partial = false): array
    {
        $rules = [
            'slug' => 'nullable|string|max:120',
            'title' => ($partial ? 'sometimes' : 'required').'|string|max:255',
            'excerpt' => 'nullable|string',
            'body' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'status' => 'nullable|string|in:draft,published',
            'published_at' => 'nullable|date',
        ];

        return $request->validate($rules);
    }
}
