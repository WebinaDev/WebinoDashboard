<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use Illuminate\Http\Request;

class PublicBlogController extends Controller
{
    use ResolvesPublicTenant;

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $query = BlogPost::query()->where('tenant_id', $tid)->published()
            ->with('category:id,slug,name')
            ->orderByDesc('published_at');

        if ($request->filled('category')) {
            $query->whereHas('category', fn ($q) => $q->where('slug', $request->string('category')));
        }

        $rows = $query->paginate(min(24, max(1, (int) $request->input('per_page', 12))));

        return response()->json($rows);
    }

    public function show(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $post = BlogPost::query()->where('tenant_id', $tid)->where('slug', $slug)
            ->published()->with(['category', 'tags'])->firstOrFail();

        return response()->json(['data' => $post]);
    }

    public function category(Request $request, string $slug): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $cat = BlogCategory::query()->where('tenant_id', $tid)->where('slug', $slug)->firstOrFail();
        $posts = BlogPost::query()->where('tenant_id', $tid)->where('category_id', $cat->id)
            ->published()->orderByDesc('published_at')->paginate(12);

        return response()->json([
            'data' => ['category' => $cat, 'posts' => $posts],
        ]);
    }
}
