<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderRevision;
use App\Services\Builder\BuilderDocumentRules;
use App\Services\Builder\BuilderRevisions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BuilderRevisionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'target' => ['required', 'string', Rule::in(array_keys(BuilderRevisions::TARGETS))],
            'id' => ['required', 'integer', 'min:1'],
        ]);
        $tid = (int) $request->user()->tenant_id;
        BuilderRevisions::target($data['target'], $tid, (int) $data['id']);

        $rows = BuilderRevision::query()
            ->where('tenant_id', $tid)->where('target_type', $data['target'])->where('target_id', (int) $data['id'])
            ->with('user:id,name')
            ->orderByDesc('id')
            ->limit(BuilderRevisions::KEEP)
            ->get(['id', 'user_id', 'reason', 'size', 'created_at', 'updated_at']);

        return response()->json(['data' => $rows->map(fn (BuilderRevision $r) => [
            'id' => $r->id,
            'reason' => $r->reason,
            'size' => $r->size,
            'user_name' => $r->user?->name,
            'created_at' => optional($r->created_at)?->toIso8601String(),
            'updated_at' => optional($r->updated_at)?->toIso8601String(),
        ])->values()]);
    }

    public function show(Request $request, int $revision): JsonResponse
    {
        $row = $this->row($request, $revision);

        return response()->json(['data' => [
            'id' => $row->id,
            'target_type' => $row->target_type,
            'target_id' => $row->target_id,
            'reason' => $row->reason,
            'document' => $row->document,
            'created_at' => optional($row->created_at)?->toIso8601String(),
        ]]);
    }

    /** Copies the revision into the draft (never touches the published copy). */
    public function restore(Request $request, int $revision): JsonResponse
    {
        \App\Services\Builder\BuilderAccess::authorize($request, 'edit');
        $row = $this->row($request, $revision);
        $model = BuilderRevisions::target($row->target_type, (int) $row->tenant_id, (int) $row->target_id);
        [, $draft] = BuilderRevisions::TARGETS[$row->target_type];
        $model->{$draft} = BuilderDocumentRules::normalize($row->document);
        BuilderRevisions::$forcedReason = 'restore';
        try {
            $model->save();
        } finally {
            BuilderRevisions::$forcedReason = null;
        }

        return response()->json(['data' => ['document' => $model->{$draft}, 'restored_from' => $row->id]]);
    }

    private function row(Request $request, int $id): BuilderRevision
    {
        return BuilderRevision::query()->where('tenant_id', (int) $request->user()->tenant_id)->findOrFail($id);
    }
}
