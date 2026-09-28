<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductQuestion;
use App\Support\PortalAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductQuestionController extends Controller
{
    public function accountStore(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $data = $request->validate([
            'product_id' => ['required', 'integer'],
            'body' => ['required', 'string', 'min:3', 'max:2000'],
        ]);

        $product = Product::query()
            ->where('tenant_id', $user->tenant_id)
            ->whereKey((int) $data['product_id'])
            ->firstOrFail();

        $question = ProductQuestion::query()->create([
            'tenant_id' => $user->tenant_id,
            'product_id' => $product->id,
            'user_id' => $user->id,
            'body' => $data['body'],
            'status' => ProductQuestion::STATUS_PENDING,
        ]);

        return response()->json(['data' => $this->map($question->load('product:id,name,slug'))], 201);
    }

    public function accountProducts(Request $request): JsonResponse
    {
        $user = PortalAccess::authorize($request);
        $tid = (int) $user->tenant_id;

        $purchased = OrderItem::query()
            ->whereHas('order', fn ($q) => $q->where('tenant_id', $tid)->where('user_id', $user->id))
            ->distinct()
            ->pluck('product_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $ids = array_values(array_filter(array_unique(array_merge(
            $purchased,
            array_map('intval', $user->wishlist ?? []),
        ))));

        $products = $ids === []
            ? []
            : Product::query()
                ->where('tenant_id', $tid)
                ->whereIn('id', $ids)
                ->orderBy('name')
                ->limit(200)
                ->get(['id', 'name', 'slug'])
                ->map(fn (Product $p) => $p->only(['id', 'name', 'slug']))
                ->all();

        return response()->json(['data' => $products]);
    }

    /** @return list<array<string, mixed>> */
    public function forUser(int $tenantId, int $userId): array
    {
        return ProductQuestion::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->where('status', '!=', ProductQuestion::STATUS_TRASH)
            ->with('product:id,name,slug')
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->map(fn (ProductQuestion $q) => $this->map($q))
            ->all();
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $status = (string) $request->query('status', 'pending');
        $search = trim((string) $request->query('search', ''));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));

        $counts = [];
        foreach (['all', ...ProductQuestion::STATUSES] as $tab) {
            $q = ProductQuestion::query()->where('tenant_id', $tid);
            if ($tab !== 'all') {
                $q->where('status', $tab);
            }
            $counts[$tab] = $q->count();
        }

        $query = ProductQuestion::query()
            ->where('tenant_id', $tid)
            ->with(['product:id,name,slug', 'user:id,name,email'])
            ->orderByDesc('id');

        if ($status !== 'all' && in_array($status, ProductQuestion::STATUSES, true)) {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($sub) use ($search) {
                $sub->where('body', 'like', '%'.$search.'%')
                    ->orWhere('answer', 'like', '%'.$search.'%')
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', '%'.$search.'%'));
            });
        }

        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (ProductQuestion $q) => $this->map($q))->values()->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'counts' => $counts,
            ],
        ]);
    }

    public function moderate(Request $request, int $question): JsonResponse
    {
        $row = ProductQuestion::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($question)
            ->firstOrFail();

        $data = $request->validate([
            'status' => ['sometimes', 'string', Rule::in(ProductQuestion::STATUSES)],
            'answer' => ['sometimes', 'nullable', 'string', 'max:4000'],
        ]);

        if (array_key_exists('answer', $data)) {
            $answer = trim((string) $data['answer']);
            $row->answer = $answer !== '' ? $answer : null;
            if ($row->answer !== null) {
                $row->answered_at = now();
                if (! isset($data['status'])) {
                    $row->status = ProductQuestion::STATUS_ANSWERED;
                }
            }
        }
        if (isset($data['status'])) {
            $row->status = $data['status'];
        }
        $row->save();

        return response()->json(['data' => $this->map($row->fresh(['product:id,name,slug', 'user:id,name,email']))]);
    }

    /** @return array<string, mixed> */
    private function map(ProductQuestion $q): array
    {
        return [
            'id' => $q->id,
            'product_id' => $q->product_id,
            'user_id' => $q->user_id,
            'body' => $q->body,
            'answer' => $q->answer,
            'status' => $q->status,
            'answered_at' => optional($q->answered_at)?->toIso8601String(),
            'created_at' => optional($q->created_at)?->toIso8601String(),
            'product' => $q->product ? $q->product->only(['id', 'name', 'slug']) : null,
            'author_name' => $q->relationLoaded('user') ? $q->user?->name : null,
        ];
    }
}
