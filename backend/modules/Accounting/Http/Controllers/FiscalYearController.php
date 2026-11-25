<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Support\AppliesIndexQuery;

class FiscalYearController extends Controller
{
    use AppliesIndexQuery;

    public function index(Request $request): JsonResponse
    {
        $query = AccFiscalYear::query();

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['title'],
            ['starts_on', 'ends_on', 'created_at'],
            'starts_on',
            'desc',
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccFiscalYear::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => 'required|string|max:100',
            'starts_on' => 'required|date',
            'ends_on' => 'required|date|after:starts_on',
            'is_closed' => 'nullable|boolean',
        ]);

        $row = AccFiscalYear::query()->create($data + ['is_closed' => $data['is_closed'] ?? false]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccFiscalYear::query()->findOrFail($id);

        $data = $request->validate([
            'title' => 'sometimes|string|max:100',
            'starts_on' => 'sometimes|date',
            'ends_on' => 'sometimes|date|after:starts_on',
            'is_closed' => 'sometimes|boolean',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccFiscalYear::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
