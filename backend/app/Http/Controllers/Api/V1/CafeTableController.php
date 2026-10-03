<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CafeBranch;
use App\Models\CafeTable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CafeTableController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tables = CafeTable::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->with('branch:id,name_fa,name_en,slug')
            ->orderBy('sort_order')
            ->orderBy('code')
            ->get();

        return response()->json(['data' => $tables]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $this->validateTable($request, $tid);
        $table = CafeTable::query()->create([
            'tenant_id' => $tid,
            'branch_id' => $data['branch_id'] ?? null,
            'code' => $data['code'],
            'label' => $data['label'] ?? null,
            'seats' => $data['seats'] ?? 4,
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $table->load('branch:id,name_fa,name_en,slug')], 201);
    }

    public function update(Request $request, CafeTable $table): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $table->tenant_id, 403);
        $data = $this->validateTable($request, $table->tenant_id, true);
        $table->update($data);

        return response()->json(['data' => $table->fresh()->load('branch:id,name_fa,name_en,slug')]);
    }

    public function destroy(Request $request, CafeTable $table): \Illuminate\Http\JsonResponse
    {
        abort_if($request->user()->tenant_id !== $table->tenant_id, 403);
        $table->delete();

        return response()->json([], 204);
    }

    /** @return array<string, mixed> */
    private function validateTable(Request $request, int $tid, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'code' => [$req, 'string', 'max:32', Rule::unique('cafe_tables', 'code')->where('tenant_id', $tid)->ignore($request->route('table'))],
            'label' => ['nullable', 'string', 'max:255'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:99'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'branch_id' => ['nullable', 'integer', Rule::exists('cafe_branches', 'id')->where('tenant_id', $tid)],
        ]);
    }
}
