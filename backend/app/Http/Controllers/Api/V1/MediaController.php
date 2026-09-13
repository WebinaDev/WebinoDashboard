<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MediaController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $query = MediaAsset::query()->where('tenant_id', $tid)->orderByDesc('id');

        if ($request->filled('folder')) {
            $query->where('folder', $request->string('folder'));
        }

        $rows = $query->paginate(min(48, max(1, (int) $request->input('per_page', 24))));

        return response()->json($rows);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'file' => 'required|file|max:20480',
            'folder' => 'nullable|string|max:120',
            'alt' => 'nullable|string|max:255',
        ]);

        $tid = (int) $request->user()->tenant_id;
        $file = $data['file'];
        $folder = $data['folder'] ?? null;
        $dir = 'media/'.$tid.($folder ? '/'.trim($folder, '/') : '');

        $storedPath = $file->store($dir, 'public');

        $row = MediaAsset::query()->create([
            'tenant_id' => $tid,
            'folder' => $folder,
            'path' => $storedPath,
            'disk' => 'public',
            'mime' => $file->getMimeType(),
            'size' => $file->getSize() ?: 0,
            'alt' => $data['alt'] ?? null,
            'original_name' => $file->getClientOriginalName(),
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function destroy(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = MediaAsset::query()->where('tenant_id', $tid)->findOrFail($id);

        $disk = $row->disk === 'local' ? 'public' : $row->disk;
        if ($row->path && Storage::disk($disk)->exists($row->path)) {
            Storage::disk($disk)->delete($row->path);
        }

        $row->delete();

        return response()->json(null, 204);
    }
}
