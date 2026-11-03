<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportDepartment;
use App\Services\Support\SupportTicketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupportDepartmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = SupportDepartment::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => ['items' => $rows->map(fn ($d) => $this->map($d))->all()]]);
    }

    public function store(Request $request, SupportTicketService $tickets): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request, $tid);
        $slug = $data['slug'] ?? $tickets->slugify($data['name_en'] ?: $data['name_fa']);
        $slug = $this->uniqueSlug($tid, $slug);
        $row = SupportDepartment::query()->create([
            ...$this->attrs($data),
            'tenant_id' => $tid,
            'slug' => $slug,
        ]);

        return response()->json(['data' => $this->map($row)], 201);
    }

    public function update(Request $request, int $department): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportDepartment::query()->where('tenant_id', $tid)->where('id', $department)->firstOrFail();
        $data = $this->validated($request, $tid, $row->id);
        if (isset($data['slug']) && $data['slug'] !== $row->slug) {
            $data['slug'] = $this->uniqueSlug($tid, $data['slug'], $row->id);
        }
        $row->fill($this->attrs($data, partial: true));
        $row->save();

        return response()->json(['data' => $this->map($row->fresh())]);
    }

    public function destroy(Request $request, int $department): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportDepartment::query()->where('tenant_id', $tid)->where('id', $department)->firstOrFail();
        $row->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, int $tenantId, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name_fa' => [$ignoreId ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:80', 'alpha_dash', Rule::unique('support_departments', 'slug')->where(fn ($q) => $q->where('tenant_id', $tenantId))->ignore($ignoreId)],
            'description_fa' => ['nullable', 'string', 'max:2000'],
            'description_en' => ['nullable', 'string', 'max:2000'],
            'color' => ['nullable', 'string', 'max:20'],
            'icon' => ['nullable', 'string', 'max:40'],
            'default_priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'default_assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'sla_first_response_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
            'sla_resolve_hours' => ['nullable', 'integer', 'min:1', 'max:2160'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'form_fields' => ['nullable', 'array', 'max:40'],
            'form_fields.*.key' => ['required_with:form_fields', 'string', 'max:60'],
            'form_fields.*.type' => ['required_with:form_fields', Rule::in(['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'email', 'phone', 'file', 'hidden'])],
            'form_fields.*.label_fa' => ['nullable', 'string', 'max:160'],
            'form_fields.*.label_en' => ['nullable', 'string', 'max:160'],
            'form_fields.*.required' => ['sometimes', 'boolean'],
            'form_fields.*.options' => ['nullable', 'array'],
            'form_fields.*.options.*' => ['string', 'max:120'],
        ]);
    }

    /** @param  array<string, mixed>  $data */
    private function attrs(array $data, bool $partial = false): array
    {
        $keys = [
            'name_fa', 'name_en', 'slug', 'description_fa', 'description_en', 'color', 'icon',
            'default_priority', 'default_assignee_id', 'sla_first_response_hours', 'sla_resolve_hours',
            'is_active', 'sort_order', 'form_fields',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $data) || (! $partial && $k === 'name_fa')) {
                if (array_key_exists($k, $data)) {
                    $out[$k] = $data[$k];
                }
            }
        }
        if (isset($out['default_priority']) && $out['default_priority'] === null) {
            $out['default_priority'] = 'normal';
        }

        return $out;
    }

    private function uniqueSlug(int $tenantId, string $slug, ?int $ignoreId = null): string
    {
        $base = $slug !== '' ? $slug : 'dept';
        $candidate = $base;
        $i = 2;
        while (
            SupportDepartment::query()
                ->where('tenant_id', $tenantId)
                ->where('slug', $candidate)
                ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $candidate = mb_substr($base, 0, 70).'-'.$i;
            $i++;
        }

        return $candidate;
    }

    /** @return array<string, mixed> */
    private function map(SupportDepartment $d): array
    {
        return [
            'id' => $d->id,
            'name_fa' => $d->name_fa,
            'name_en' => $d->name_en,
            'slug' => $d->slug,
            'description_fa' => $d->description_fa,
            'description_en' => $d->description_en,
            'color' => $d->color,
            'icon' => $d->icon,
            'default_priority' => $d->default_priority,
            'default_assignee_id' => $d->default_assignee_id,
            'sla_first_response_hours' => $d->sla_first_response_hours,
            'sla_resolve_hours' => $d->sla_resolve_hours,
            'is_active' => (bool) $d->is_active,
            'sort_order' => (int) $d->sort_order,
            'form_fields' => $d->form_fields ?? [],
        ];
    }
}
