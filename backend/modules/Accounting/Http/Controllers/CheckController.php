<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccCheck;
use Modules\Accounting\Support\AppliesIndexQuery;
use Modules\Accounting\Support\ExistsForTenant;

class CheckController extends Controller
{
    use AppliesIndexQuery;

    public function checks(Request $request): JsonResponse
    {
        $query = AccCheck::query()->with(['cashAccount', 'person']);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['number', 'bank'],
            ['id', 'due_date', 'created_at'],
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccCheck::query()->with(['cashAccount', 'person'])->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => 'nullable|string|max:50',
            'number' => 'required|string|max:100',
            'bank' => 'nullable|string|max:255',
            'amount' => 'required|numeric|min:0',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|in:issued,deposited,cleared,bounced,returned',
            'cash_account_id' => ['nullable', ExistsForTenant::in('acc_cash_accounts')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
        ]);

        $row = AccCheck::query()->create($data + ['status' => $data['status'] ?? 'issued']);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccCheck::query()->findOrFail($id);

        $data = $request->validate([
            'type' => 'nullable|string|max:50',
            'number' => 'sometimes|string|max:100',
            'bank' => 'nullable|string|max:255',
            'amount' => 'sometimes|numeric|min:0',
            'due_date' => 'nullable|date',
            'status' => 'sometimes|string|in:issued,deposited,cleared,bounced,returned',
            'cash_account_id' => ['nullable', ExistsForTenant::in('acc_cash_accounts')],
            'person_id' => ['nullable', ExistsForTenant::in('acc_persons')],
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccCheck::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }

    public function setCheckStatus(Request $request, int $id): JsonResponse
    {
        $c = AccCheck::query()->findOrFail($id);
        $data = $request->validate([
            'status' => 'required|string|in:issued,deposited,cleared,bounced,returned',
        ]);
        $c->update(['status' => $data['status']]);

        return response()->json(['data' => $c->fresh()]);
    }
}
