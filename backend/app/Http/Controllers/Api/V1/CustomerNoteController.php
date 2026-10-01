<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CustomerNote;
use App\Models\User;
use App\Services\Webino\WebinoCrmClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerNoteController extends Controller
{
    public function index(Request $request, int $customer): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        User::query()->where('tenant_id', $tid)->whereKey($customer)->firstOrFail();

        $notes = CustomerNote::query()
            ->where('tenant_id', $tid)
            ->where('customer_user_id', $customer)
            ->with('author:id,name')
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        $erp = app(WebinoCrmClient::class);
        $erpNotes = [];
        $erpAccountId = (int) $request->query('erp_account_id', 0);
        if ($erpAccountId > 0 && $erp->isConfigured()) {
            $res = $erp->listNotes($erpAccountId);
            if ($res['ok']) {
                $erpNotes = data_get($res['data'], 'data.notes', data_get($res['data'], 'notes', []));
            }
        }

        return response()->json([
            'data' => [
                'notes' => $notes,
                'erp_notes' => $erpNotes,
                'erp_unavailable' => $erpAccountId > 0 && ! $erp->isConfigured(),
            ],
        ]);
    }

    public function store(Request $request, int $customer): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        User::query()->where('tenant_id', $tid)->whereKey($customer)->firstOrFail();
        $data = $request->validate([
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:20000'],
            'erp_account_id' => ['nullable', 'integer', 'min:1'],
            'sync_erp' => ['nullable', 'boolean'],
        ]);

        $note = CustomerNote::query()->create([
            'tenant_id' => $tid,
            'customer_user_id' => $customer,
            'author_id' => $request->user()->id,
            'erp_account_id' => $data['erp_account_id'] ?? null,
            'subject' => $data['subject'] ?? null,
            'body' => $data['body'],
        ]);

        if (! empty($data['sync_erp']) && ! empty($data['erp_account_id'])) {
            $erp = app(WebinoCrmClient::class);
            if ($erp->isConfigured()) {
                $res = $erp->storeNote((int) $data['erp_account_id'], $data['body'], $data['subject'] ?? null);
                $erpId = data_get($res['data'], 'data.id') ?? data_get($res['data'], 'id');
                if ($res['ok'] && $erpId) {
                    $note->erp_note_id = (int) $erpId;
                    $note->save();
                }
            }
        }

        return response()->json(['data' => $note->fresh('author:id,name')], 201);
    }

    public function destroy(Request $request, int $customer, int $note): JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $row = CustomerNote::query()
            ->where('tenant_id', $tid)
            ->where('customer_user_id', $customer)
            ->whereKey($note)
            ->firstOrFail();

        if ($row->erp_account_id && $row->erp_note_id) {
            $erp = app(WebinoCrmClient::class);
            if ($erp->isConfigured()) {
                $erp->destroyNote((int) $row->erp_account_id, (int) $row->erp_note_id);
            }
        }
        $row->delete();

        return response()->json([], 204);
    }
}
