<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Testimonial;
use Illuminate\Http\Request;

class TestimonialController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = Testimonial::query()->where('tenant_id', $tid)->orderBy('sort_order')->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'author' => 'required|string|max:120',
            'role' => 'nullable|string|max:120',
            'company' => 'nullable|string|max:120',
            'quote' => 'required|string',
            'rating' => 'nullable|integer|min:1|max:5',
            'avatar_url' => 'nullable|string|max:500',
            'published' => 'boolean',
            'sort_order' => 'integer',
        ]);
        $row = Testimonial::query()->create(['tenant_id' => $request->user()->tenant_id, ...$data]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $testimonial): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = Testimonial::query()->where('tenant_id', $tid)->findOrFail($testimonial);
        $data = $request->validate([
            'author' => 'sometimes|string|max:120',
            'role' => 'nullable|string|max:120',
            'company' => 'nullable|string|max:120',
            'quote' => 'sometimes|string',
            'rating' => 'nullable|integer|min:1|max:5',
            'avatar_url' => 'nullable|string|max:500',
            'published' => 'boolean',
            'sort_order' => 'integer',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, int $testimonial): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        Testimonial::query()->where('tenant_id', $tid)->where('id', $testimonial)->delete();

        return response()->json(null, 204);
    }
}
