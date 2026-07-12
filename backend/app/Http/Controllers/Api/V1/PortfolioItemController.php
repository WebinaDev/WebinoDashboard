<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PortfolioItem;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PortfolioItemController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = PortfolioItem::query()->where('tenant_id', $tid)->orderByDesc('id')->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string',
            'images' => 'nullable|array',
            'category' => 'nullable|string|max:120',
            'client' => 'nullable|string|max:120',
            'published' => 'boolean',
            'published_at' => 'nullable|date',
        ]);
        $tid = $request->user()->tenant_id;
        $row = PortfolioItem::query()->create([
            'tenant_id' => $tid,
            'slug' => $data['slug'] ?? Str::slug($data['title']),
            ...$data,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $item): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = PortfolioItem::query()->where('tenant_id', $tid)->findOrFail($item);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string',
            'images' => 'nullable|array',
            'category' => 'nullable|string|max:120',
            'client' => 'nullable|string|max:120',
            'published' => 'boolean',
            'published_at' => 'nullable|date',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, int $item): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        PortfolioItem::query()->where('tenant_id', $tid)->where('id', $item)->delete();

        return response()->json(null, 204);
    }
}
