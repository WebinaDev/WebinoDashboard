<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderLibraryItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BuilderLibraryController extends Controller
{
    private const KINDS = ['section', 'page', 'widget'];

    private const MAX_BYTES = 1_000_000;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['kind' => ['nullable', Rule::in(self::KINDS)]]);
        $rows = BuilderLibraryItem::query()
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->when($data['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json(['data' => $rows->map(fn (BuilderLibraryItem $r) => $this->row($r))->values()]);
    }

    public function show(Request $request, int $item): JsonResponse
    {
        return response()->json(['data' => $this->row($this->find($request, $item), true)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(self::KINDS)],
            'title' => ['required', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'max:80'],
            'document' => ['required', 'array'],
            'document.sections' => ['required', 'array', 'min:1'],
        ]);
        if (strlen((string) json_encode($data['document'])) > self::MAX_BYTES) {
            return response()->json(['message' => 'سند بیش از حد بزرگ است.'], 422);
        }
        $row = BuilderLibraryItem::query()->create([
            'tenant_id' => (int) $request->user()->tenant_id,
            'user_id' => $request->user()->id,
            'kind' => $data['kind'],
            'title' => strip_tags($data['title']),
            'category' => isset($data['category']) ? strip_tags($data['category']) : null,
            'document' => $data['document'],
        ]);

        return response()->json(['data' => $this->row($row, true)], 201);
    }

    public function destroy(Request $request, int $item): JsonResponse
    {
        $this->find($request, $item)->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function find(Request $request, int $id): BuilderLibraryItem
    {
        return BuilderLibraryItem::query()
            ->where('tenant_id', (int) $request->user()->tenant_id)
            ->whereKey($id)
            ->firstOrFail();
    }

    private function row(BuilderLibraryItem $r, bool $withDocument = false): array
    {
        return [
            'id' => $r->id,
            'kind' => $r->kind,
            'title' => $r->title,
            'category' => $r->category,
            'created_at' => optional($r->created_at)?->toIso8601String(),
        ] + ($withDocument ? ['document' => $r->document] : []);
    }
}
