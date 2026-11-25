<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccWarehouse;
use Modules\Accounting\Support\AppliesIndexQuery;

class WarehouseController extends Controller
{
    use AppliesIndexQuery;

    public function index(Request $request): JsonResponse
    {
        $query = AccWarehouse::query();

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['name', 'code', 'location', 'address'],
            ['id', 'name', 'created_at'],
            'name',
            'asc',
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccWarehouse::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'address' => 'nullable|string',
            'location' => 'nullable|string',
            'is_default' => 'nullable|boolean',
        ]);

        $row = AccWarehouse::query()->create($data + ['is_default' => $data['is_default'] ?? false]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccWarehouse::query()->findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'address' => 'nullable|string',
            'location' => 'nullable|string',
            'is_default' => 'sometimes|boolean',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccWarehouse::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
