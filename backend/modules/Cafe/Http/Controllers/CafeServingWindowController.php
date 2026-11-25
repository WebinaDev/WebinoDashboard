<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Cafe\Services\ServingWindows;

/**
 * Serving windows: when each item is actually on.
 *
 * The list is small and edited rarely, so it is one screen with a form rather than a
 * resource-per-window API. The `status` endpoint is the one the till calls.
 */
class CafeServingWindowController extends Controller
{
    public function __construct(private readonly ServingWindows $windows) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => [
            'windows' => $this->windows->all((int) $request->user()->tenant_id),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $window = $this->windows->save((int) $request->user()->tenant_id, $data);

        return response()->json(['data' => $window], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $this->validated($request);

        return response()->json(['data' => $this->windows->save((int) $request->user()->tenant_id, $data, $id)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->windows->delete((int) $request->user()->tenant_id, $id);

        return response()->json(['data' => ['deleted' => true]]);
    }

    /** Which of the given products are outside their window right now. */
    public function status(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json(['data' => [
            'unavailable_product_ids' => $this->windows->unavailableProductIds($tenantId),
        ]]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'label' => ['nullable', 'string', 'max:100'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'category_id' => ['nullable', 'integer'],
            'weekdays' => ['nullable', 'array', 'max:7'],
            'weekdays.*' => ['integer', 'min:0', 'max:6'],
            'start_time' => ['required', 'string', 'max:8'],
            'end_time' => ['required', 'string', 'max:8'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
