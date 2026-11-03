<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportSlaPolicy;
use App\Services\Support\TicketSlaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupportSlaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = SupportSlaPolicy::query()
            ->where('tenant_id', $tid)
            ->with(['department', 'escalateTo'])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportSlaPolicy $p) => $this->map($p))->all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request, $tid);
        $row = SupportSlaPolicy::query()->create(['tenant_id' => $tid, ...$data]);

        return response()->json(['data' => $this->map($row->load(['department', 'escalateTo']))], 201);
    }

    public function update(Request $request, int $policy): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportSlaPolicy::query()->where('tenant_id', $tid)->where('id', $policy)->firstOrFail();
        $row->fill($this->validated($request, $tid, partial: true))->save();

        return response()->json(['data' => $this->map($row->fresh(['department', 'escalateTo']))]);
    }

    public function destroy(Request $request, int $policy): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        SupportSlaPolicy::query()->where('tenant_id', $tid)->where('id', $policy)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function dashboard(Request $request, TicketSlaService $sla): JsonResponse
    {
        return response()->json(['data' => $sla->dashboard((int) $request->user()->tenant_id)]);
    }

    public function refresh(Request $request, TicketSlaService $sla): JsonResponse
    {
        return response()->json(['data' => $sla->refreshTenant((int) $request->user()->tenant_id)]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, int $tenantId, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'name_fa' => [$req, 'string', 'max:160'],
            'name_en' => ['nullable', 'string', 'max:160'],
            'department_id' => ['nullable', 'integer', Rule::exists('support_departments', 'id')->where(fn ($q) => $q->where('tenant_id', $tenantId))],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'first_response_minutes' => [$req, 'integer', 'min:1', 'max:10080'],
            'resolve_minutes' => [$req, 'integer', 'min:1', 'max:43200'],
            'business_hours_only' => ['sometimes', 'boolean'],
            'alert_before_minutes' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'escalate_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
        foreach (['business_hours_only', 'is_active'] as $b) {
            if (isset($data[$b])) {
                $data[$b] = (bool) $data[$b];
            }
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function map(SupportSlaPolicy $p): array
    {
        return [
            'id' => $p->id,
            'name_fa' => $p->name_fa,
            'name_en' => $p->name_en,
            'department_id' => $p->department_id,
            'department_name' => $p->department?->name_fa ?? $p->department?->name_en,
            'priority' => $p->priority,
            'first_response_minutes' => (int) $p->first_response_minutes,
            'resolve_minutes' => (int) $p->resolve_minutes,
            'business_hours_only' => (bool) $p->business_hours_only,
            'alert_before_minutes' => (int) $p->alert_before_minutes,
            'escalate_to_user_id' => $p->escalate_to_user_id,
            'escalate_to_name' => $p->escalateTo?->name,
            'is_active' => (bool) $p->is_active,
            'sort_order' => (int) $p->sort_order,
        ];
    }
}
