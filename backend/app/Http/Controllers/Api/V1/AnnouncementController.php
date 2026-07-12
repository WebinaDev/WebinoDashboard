<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $rows = Announcement::query()->where('tenant_id', $tid)->orderByDesc('pinned')->orderByDesc('id')->paginate(20);

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'nullable|string',
            'type' => 'nullable|string|max:32',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date',
            'pinned' => 'boolean',
            'published' => 'boolean',
        ]);
        $row = Announcement::query()->create(['tenant_id' => $request->user()->tenant_id, ...$data]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $announcement): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = Announcement::query()->where('tenant_id', $tid)->findOrFail($announcement);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'body' => 'nullable|string',
            'type' => 'nullable|string|max:32',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date',
            'pinned' => 'boolean',
            'published' => 'boolean',
        ]);
        $row->update($data);

        return response()->json(['data' => $row]);
    }

    public function destroy(Request $request, int $announcement): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        Announcement::query()->where('tenant_id', $tid)->where('id', $announcement)->delete();

        return response()->json(null, 204);
    }
}
