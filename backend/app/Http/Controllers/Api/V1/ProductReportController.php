<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** "Seen it cheaper?" and "Report a problem" forms on the product page, plus the admin inbox. */
class ProductReportController extends Controller
{
    use ResolvesPublicTenant;

    public function publicStore(Request $request, string $slug): JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(ProductReport::TYPES)],
            'issue_kind' => ['nullable', 'string', Rule::in(ProductReport::ISSUE_KINDS)],
            'name' => ['nullable', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:190'],
            'competitor_url' => ['nullable', 'url', 'max:1024', 'required_if:type,lower_price'],
            'competitor_price_minor' => ['nullable', 'integer', 'min:0'],
            'message' => ['nullable', 'string', 'max:2000', 'required_if:type,issue'],
        ]);
        $product = Product::query()->where('tenant_id', $tid)->publicKey($slug)->catalogListing(true)->firstOrFail();
        $user = $request->user('sanctum');

        $report = ProductReport::query()->create(array_merge($data, [
            'tenant_id' => $tid,
            'product_id' => $product->id,
            'user_id' => $user && (int) $user->tenant_id === $tid ? $user->id : null,
            'issue_kind' => $data['type'] === ProductReport::TYPE_ISSUE ? ($data['issue_kind'] ?? 'other') : null,
            'status' => 'new',
            'ip' => $request->ip(),
        ]));

        return response()->json(['data' => ['ok' => true, 'id' => $report->id]], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $q = ProductReport::query()->where('tenant_id', $tid)->with('product:id,name,slug,price_minor')->latest('id');
        if ($request->filled('type')) {
            $q->where('type', (string) $request->query('type'));
        }
        if ($request->filled('status')) {
            $q->where('status', (string) $request->query('status'));
        }

        $page = $q->paginate(min(100, max(1, (int) $request->query('per_page', 25))));

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function update(Request $request, int $report): JsonResponse
    {
        $row = ProductReport::query()->where('tenant_id', (int) $request->user()->tenant_id)->findOrFail($report);
        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(ProductReport::STATUSES)],
            'admin_note' => ['nullable', 'string', 'max:2000'],
        ]);
        $row->update($data);

        return response()->json(['data' => $row->fresh()]);
    }
}
