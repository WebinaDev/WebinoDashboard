<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccPerson;
use Modules\Accounting\Support\AppliesIndexQuery;

class PersonController extends Controller
{
    use AppliesIndexQuery;

    public function index(Request $request): JsonResponse
    {
        $query = AccPerson::query();

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        $paginator = $this->applyIndexQuery(
            $query,
            $request,
            [],
            ['name', 'mobile', 'national_id', 'economic_code'],
            ['id', 'name', 'created_at'],
        );

        return $this->paginatedJsonResponse($paginator);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => AccPerson::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:50',
            'national_id' => 'nullable|string|max:50',
            'economic_code' => 'nullable|string|max:50',
            'mobile' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'category' => 'nullable|string|max:100',
        ]);

        $row = AccPerson::query()->create($data);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = AccPerson::query()->findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => 'nullable|string|max:50',
            'national_id' => 'nullable|string|max:50',
            'economic_code' => 'nullable|string|max:50',
            'mobile' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'category' => 'nullable|string|max:100',
        ]);

        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        AccPerson::query()->whereKey($id)->delete();

        return response()->json([], 204);
    }
}
