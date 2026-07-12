<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\TeamMember;
use Illuminate\Http\Request;

class TeamMemberController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = TeamMember::query()->where('tenant_id', $tid)->orderBy('sort_order')->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'role' => 'nullable|string|max:120',
            'bio' => 'nullable|string',
            'photo_url' => 'nullable|string|max:500',
            'social_links' => 'nullable|array',
            'sort_order' => 'integer',
            'published' => 'boolean',
        ]);
        $row = TeamMember::query()->create(['tenant_id' => $request->user()->tenant_id, ...$data]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $member): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = TeamMember::query()->where('tenant_id', $tid)->findOrFail($member);
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'role' => 'nullable|string|max:120',
            'bio' => 'nullable|string',
            'photo_url' => 'nullable|string|max:500',
            'social_links' => 'nullable|array',
            'sort_order' => 'integer',
            'published' => 'boolean',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, int $member): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        TeamMember::query()->where('tenant_id', $tid)->where('id', $member)->delete();

        return response()->json(null, 204);
    }
}
