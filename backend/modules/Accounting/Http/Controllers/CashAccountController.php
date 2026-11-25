<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccCashAccount;
use Modules\Accounting\Support\AppliesIndexQuery;

class CashAccountController extends Controller
{
    use AppliesIndexQuery;

    public function cashAccounts(Request $request): JsonResponse
    {
        $query = AccCashAccount::query();

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['name', 'bank_name', 'account_number', 'sheba'],
            ['id', 'name', 'created_at'],
            'name',
            'asc',
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccCashAccount::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:50',
            'bank_name' => 'nullable|string|max:255',
            'account_number' => 'nullable|string|max:100',
            'sheba' => 'nullable|string|max:50',
            'card_number' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
        ]);

        $row = AccCashAccount::query()->create($data + [
            'is_active' => $data['is_active'] ?? true,
            'is_default' => $data['is_default'] ?? false,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccCashAccount::query()->findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => 'nullable|string|max:50',
            'bank_name' => 'nullable|string|max:255',
            'account_number' => 'nullable|string|max:100',
            'sheba' => 'nullable|string|max:50',
            'card_number' => 'nullable|string|max:50',
            'is_active' => 'sometimes|boolean',
            'is_default' => 'sometimes|boolean',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccCashAccount::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
