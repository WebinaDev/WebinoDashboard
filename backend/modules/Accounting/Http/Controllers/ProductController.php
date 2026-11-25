<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccProduct;
use Modules\Accounting\Support\AppliesIndexQuery;

class ProductController extends Controller
{
    use AppliesIndexQuery;

    public function index(Request $request): JsonResponse
    {
        $query = AccProduct::query();

        if ($request->filled('q')) {
            $term = '%'.$request->string('q').'%';
            $query->where(function ($q) use ($term) {
                $q->where('name', 'like', $term)->orWhere('barcode', 'like', $term);
            });
        }
        if ($request->filled('category')) {
            $query->where('category', $request->input('category'));
        }

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['name', 'barcode'],
            ['id', 'name', 'created_at'],
            'name',
            'asc',
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccProduct::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'unit' => 'nullable|string|max:50',
            'barcode' => 'nullable|string|max:100',
            'category' => 'nullable|string|max:100',
            'buy_price' => 'nullable|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'inventory_controlled' => 'nullable|boolean',
        ]);

        $row = AccProduct::query()->create($data + ['inventory_controlled' => $data['inventory_controlled'] ?? true]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccProduct::query()->findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'unit' => 'nullable|string|max:50',
            'barcode' => 'nullable|string|max:100',
            'category' => 'nullable|string|max:100',
            'buy_price' => 'nullable|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'inventory_controlled' => 'sometimes|boolean',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccProduct::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
