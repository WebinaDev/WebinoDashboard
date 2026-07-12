<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AcademyCourse;
use App\Models\AcademyLesson;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AcademyCourseController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = AcademyCourse::query()->where('tenant_id', $tid)
            ->withCount('lessons')->orderBy('sort_order')->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'published' => 'boolean',
            'sort_order' => 'integer',
        ]);
        $tid = $request->user()->tenant_id;
        $row = AcademyCourse::query()->create([
            'tenant_id' => $tid,
            'slug' => $data['slug'] ?? Str::slug($data['title']),
            ...$data,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $course): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = AcademyCourse::query()->where('tenant_id', $tid)->findOrFail($course);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'published' => 'boolean',
            'sort_order' => 'integer',
        ]);
        $row->update($data);

        return response()->json(['data' => $row->fresh('lessons')]);
    }

    public function destroy(Request $request, int $course): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        AcademyCourse::query()->where('tenant_id', $tid)->where('id', $course)->delete();

        return response()->json(null, 204);
    }

    public function storeLesson(Request $request, int $course): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $parent = AcademyCourse::query()->where('tenant_id', $tid)->findOrFail($course);
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'content' => 'nullable|string',
            'video_url' => 'nullable|string|max:500',
            'sort_order' => 'integer',
            'published' => 'boolean',
        ]);
        $lesson = $parent->lessons()->create([
            'slug' => $data['slug'] ?? Str::slug($data['title']),
            ...$data,
        ]);

        return response()->json(['data' => $lesson], 201);
    }
}
