<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportDepartment;
use App\Services\Support\OnlineSupportSettings;
use App\Services\Support\SupportTicketService;
use App\Services\Support\TicketSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OnlineSupportController extends Controller
{
    public function settingsShow(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => [
                'online' => OnlineSupportSettings::get($tid),
                'tickets' => TicketSettings::get($tid),
            ],
        ]);
    }

    public function settingsUpdate(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'online' => ['sometimes', 'array'],
            'tickets' => ['sometimes', 'array'],
        ]);
        $out = [];
        if (isset($data['online'])) {
            $out['online'] = OnlineSupportSettings::put($tid, $data['online']);
        } else {
            $out['online'] = OnlineSupportSettings::get($tid);
        }
        if (isset($data['tickets'])) {
            $out['tickets'] = TicketSettings::put($tid, $data['tickets']);
        } else {
            $out['tickets'] = TicketSettings::get($tid);
        }

        return response()->json(['data' => $out]);
    }

    public function publicWidget(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');

        return response()->json(['data' => OnlineSupportSettings::public($tid)]);
    }

    public function publicDepartments(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $rows = SupportDepartment::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['id', 'name_fa', 'name_en', 'slug', 'color', 'form_fields', 'default_priority']);

        return response()->json([
            'data' => [
                'items' => $rows->map(fn ($d) => [
                    'id' => $d->id,
                    'name_fa' => $d->name_fa,
                    'name_en' => $d->name_en,
                    'slug' => $d->slug,
                    'color' => $d->color,
                    'form_fields' => collect($d->form_fields ?? [])->filter(fn ($f) => ($f['type'] ?? '') !== 'hidden')->values()->all(),
                    'default_priority' => $d->default_priority,
                ])->all(),
            ],
        ]);
    }

    public function publicSubmit(Request $request, SupportTicketService $tickets): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $settings = OnlineSupportSettings::get($tid);
        abort_unless($settings['enabled'], 404);
        abort_unless((bool) data_get($settings, 'channels.ticket.enabled', true), 422, 'Ticket channel disabled');
        abort_unless((bool) data_get($settings, 'offline.form_enabled', true) || OnlineSupportSettings::isWithinHours($settings), 422);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'subject' => ['required', 'string', 'max:190'],
            'body' => ['required', 'string', 'max:20000'],
            'department_id' => ['nullable', 'integer'],
            'form_values' => ['nullable', 'array'],
        ]);

        $deptId = $data['department_id'] ?? data_get($settings, 'offline.default_department_id');
        if ($deptId) {
            $ok = SupportDepartment::query()->where('tenant_id', $tid)->where('id', (int) $deptId)->where('is_active', true)->exists();
            abort_unless($ok, 422, 'Invalid department');
        }

        $user = $request->user();
        $ticket = $tickets->createTicket(
            $tid,
            [
                'user_id' => $user?->id,
                'guest_name' => $user ? null : $data['name'],
                'guest_email' => $user ? null : ($data['email'] ?? null),
                'guest_phone' => $user ? null : ($data['phone'] ?? null),
                'department_id' => $deptId ? (int) $deptId : null,
                'subject' => $data['subject'],
                'source' => 'widget',
            ],
            $data['body'],
            $user?->id,
            false,
            is_array($data['form_values'] ?? null) ? $data['form_values'] : null,
        );

        return response()->json([
            'data' => [
                'ok' => true,
                'ticket_number' => $ticket->ticket_number,
                'id' => $ticket->id,
            ],
        ], 201);
    }
}
