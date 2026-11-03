<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportAutomationRule;
use App\Models\SupportAutomationRun;
use App\Models\SupportTicket;
use App\Services\Support\TicketAutomationEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupportAutomationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = SupportAutomationRule::query()
            ->where('tenant_id', $tid)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportAutomationRule $r) => $this->map($r))->all(),
                'triggers' => TicketAutomationEngine::TRIGGERS,
                'action_types' => [
                    'set_status', 'set_priority', 'assign', 'add_tag', 'remove_tag',
                    'refer', 'notify', 'webhook', 'add_internal_note',
                ],
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request);
        $row = SupportAutomationRule::query()->create([
            'tenant_id' => $tid,
            ...$data,
        ]);

        return response()->json(['data' => $this->map($row)], 201);
    }

    public function update(Request $request, int $rule): JsonResponse
    {
        $row = $this->find($request, $rule);
        abort_if(! $row, 404);
        $row->fill($this->validated($request, partial: true))->save();

        return response()->json(['data' => $this->map($row)]);
    }

    public function destroy(Request $request, int $rule): JsonResponse
    {
        $row = $this->find($request, $rule);
        abort_if(! $row, 404);
        $row->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function runs(Request $request, int $rule): JsonResponse
    {
        $row = $this->find($request, $rule);
        abort_if(! $row, 404);
        $items = SupportAutomationRun::query()
            ->where('rule_id', $row->id)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (SupportAutomationRun $r) => [
                'id' => $r->id,
                'ticket_id' => $r->ticket_id,
                'status' => $r->status,
                'error' => $r->error,
                'result_payload' => $r->result_payload,
                'started_at' => optional($r->started_at)?->toIso8601String(),
                'finished_at' => optional($r->finished_at)?->toIso8601String(),
            ]);

        return response()->json(['data' => ['items' => $items]]);
    }

    public function execute(Request $request, int $rule, TicketAutomationEngine $engine): JsonResponse
    {
        $row = $this->find($request, $rule);
        abort_if(! $row, 404);
        $data = $request->validate(['ticket_id' => ['required', 'integer']]);
        $ticket = SupportTicket::query()
            ->where('tenant_id', $row->tenant_id)
            ->where('id', (int) $data['ticket_id'])
            ->firstOrFail();
        $result = $engine->runRule($row, $ticket, [
            'trigger' => $row->trigger,
            'manual' => true,
            'ticket_id' => $ticket->id,
            'status' => $ticket->status,
            'priority' => $ticket->priority,
            'department_id' => $ticket->department_id,
            'assignee_id' => $ticket->assignee_id,
            'source' => $ticket->source,
            'tags' => $ticket->tags ?? [],
        ]);

        return response()->json(['data' => $result]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'name_fa' => [$req, 'string', 'max:160'],
            'name_en' => ['nullable', 'string', 'max:160'],
            'trigger' => [$req, Rule::in(TicketAutomationEngine::TRIGGERS)],
            'conditions' => ['nullable', 'array'],
            'actions' => [$req, 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'priority' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ]);
        if (isset($data['is_active'])) {
            $data['is_active'] = (bool) $data['is_active'];
        }
        if (isset($data['priority'])) {
            $data['priority'] = (int) $data['priority'];
        }

        return $data;
    }

    private function find(Request $request, int $id): ?SupportAutomationRule
    {
        return SupportAutomationRule::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('id', $id)
            ->first();
    }

    /** @return array<string, mixed> */
    private function map(SupportAutomationRule $r): array
    {
        return [
            'id' => $r->id,
            'name_fa' => $r->name_fa,
            'name_en' => $r->name_en,
            'trigger' => $r->trigger,
            'conditions' => $r->conditions ?? [],
            'actions' => $r->actions ?? [],
            'is_active' => (bool) $r->is_active,
            'priority' => (int) $r->priority,
            'run_count' => (int) $r->run_count,
            'last_run_at' => optional($r->last_run_at)?->toIso8601String(),
        ];
    }
}
