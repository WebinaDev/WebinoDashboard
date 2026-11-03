<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportCannedResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupportCannedResponseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $q = SupportCannedResponse::query()->where('tenant_id', $tid)->orderBy('sort_order')->orderBy('id');
        if ($request->query('department_id')) {
            $q->where(function ($qq) use ($request) {
                $qq->whereNull('department_id')->orWhere('department_id', (int) $request->query('department_id'));
            });
        }
        if ($request->boolean('active_only')) {
            $q->where('is_active', true);
        }

        return response()->json([
            'data' => [
                'items' => $q->get()->map(fn ($r) => $this->map($r))->all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request, $tid);
        $row = SupportCannedResponse::query()->create([
            'tenant_id' => $tid,
            ...$data,
            'is_active' => $data['is_active'] ?? true,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return response()->json(['data' => $this->map($row)], 201);
    }

    public function update(Request $request, int $canned): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportCannedResponse::query()->where('tenant_id', $tid)->where('id', $canned)->firstOrFail();
        $data = $this->validated($request, $tid, true);
        $row->fill($data);
        $row->save();

        return response()->json(['data' => $this->map($row->fresh())]);
    }

    public function destroy(Request $request, int $canned): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        SupportCannedResponse::query()->where('tenant_id', $tid)->where('id', $canned)->firstOrFail()->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, int $tenantId, bool $partial = false): array
    {
        return $request->validate([
            'department_id' => ['nullable', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId))],
            'title_fa' => [$partial ? 'sometimes' : 'required', 'string', 'max:160'],
            'title_en' => ['nullable', 'string', 'max:160'],
            'body_fa' => [$partial ? 'sometimes' : 'required', 'string', 'max:20000'],
            'body_en' => ['nullable', 'string', 'max:20000'],
            'category' => ['nullable', 'string', 'max:80'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
    }

    /** @return array<string, mixed> */
    private function map(SupportCannedResponse $r): array
    {
        return [
            'id' => $r->id,
            'department_id' => $r->department_id,
            'title_fa' => $r->title_fa,
            'title_en' => $r->title_en,
            'body_fa' => $r->body_fa,
            'body_en' => $r->body_en,
            'category' => $r->category,
            'is_active' => (bool) $r->is_active,
            'sort_order' => (int) $r->sort_order,
        ];
    }
}
