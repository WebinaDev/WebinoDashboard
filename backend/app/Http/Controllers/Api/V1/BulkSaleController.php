<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class BulkSaleController extends Controller
{
    public const BATCH_LIMIT = 200;

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['apply', 'remove', 'preview'])],
            'percent' => ['sometimes', 'numeric', 'gt:0', 'lt:100'],
            'days' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'until' => ['sometimes', 'nullable', 'date'],
            'product_ids' => ['sometimes', 'array'],
            'product_ids.*' => ['integer'],
            'filters' => ['sometimes', 'array'],
            'filters.search' => ['sometimes', 'string'],
            'filters.category' => ['sometimes', 'string'],
            'filters.brand' => ['sometimes', 'string'],
            'filters.type' => ['sometimes', 'string'],
            'filters.status' => ['sometimes', 'string'],
        ]);

        $action = $data['action'];
        $ids = $this->resolveProductIds($request, $data);
        if ($ids === []) {
            return response()->json(['message' => __('No products selected.')], 400);
        }

        $percent = (float) ($data['percent'] ?? 0);
        if (in_array($action, ['apply', 'preview'], true) && ($percent <= 0 || $percent >= 100)) {
            return response()->json(['message' => __('Percent must be between 0 and 100.')], 400);
        }

        if ($action === 'preview') {
            $samples = [];
            foreach (array_slice($ids, 0, 5) as $pid) {
                $row = $this->previewProduct((int) $pid, $percent);
                if ($row) {
                    $samples[] = $row;
                }
            }

            return response()->json([
                'data' => [
                    'action' => 'preview',
                    'count' => count($ids),
                    'percent' => $percent,
                    'samples' => $samples,
                ],
            ]);
        }

        $startsAt = now();
        $until = trim((string) ($data['until'] ?? ''));
        if ($until !== '') {
            $endsAt = Carbon::parse($until);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $until)) {
                $endsAt = $endsAt->endOfDay();
            }
        } else {
            $endsAt = $startsAt->copy()->addDays(max(1, (int) ($data['days'] ?? 7)));
        }
        if ($action === 'apply' && $endsAt->lessThanOrEqualTo($startsAt)) {
            return response()->json(['message' => __('Sale end date must be in the future.')], 400);
        }

        $ok = 0;
        $failed = 0;
        $skipped = 0;
        $errors = [];
        foreach ($ids as $pid) {
            $result = $action === 'remove'
                ? $this->removeProduct((int) $pid)
                : $this->applyProduct((int) $pid, $percent, $startsAt, $endsAt);
            if ($result === true) {
                $ok++;
            } elseif ($result === 'skipped') {
                $skipped++;
            } else {
                $failed++;
                if (count($errors) < 10 && is_string($result)) {
                    $errors[] = ['id' => (int) $pid, 'message' => $result];
                }
            }
        }

        return response()->json([
            'data' => [
                'action' => $action,
                'ok' => $ok,
                'failed' => $failed,
                'skipped' => $skipped,
                'total' => count($ids),
                'errors' => $errors,
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return list<int>
     */
    private function resolveProductIds(Request $request, array $data): array
    {
        $tid = $request->user()->tenant_id;
        if (! empty($data['product_ids']) && is_array($data['product_ids'])) {
            $ids = array_values(array_unique(array_map('intval', $data['product_ids'])));
            $ids = array_slice($ids, 0, self::BATCH_LIMIT);

            return Product::query()
                ->where('tenant_id', $tid)
                ->whereIn('id', $ids)
                ->where('status', '!=', 'trash')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        $filters = is_array($data['filters'] ?? null) ? $data['filters'] : [];
        $q = Product::query()->where('tenant_id', $tid)->where('status', '!=', 'trash');
        $status = (string) ($filters['status'] ?? 'publish');
        if ($status !== '' && $status !== 'all') {
            $q->where('status', $status);
        }
        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $like = '%'.$search.'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)->orWhere('sku', 'like', $like);
            });
        }
        if ($type = (string) ($filters['type'] ?? '')) {
            $q->where('type', $type);
        }
        if ($cat = (string) ($filters['category'] ?? '')) {
            if (ctype_digit($cat)) {
                $cid = (int) $cat;
                $q->where(function ($w) use ($cid) {
                    $w->where('category_id', $cid)->orWhereHas('categories', fn ($c) => $c->where('categories.id', $cid));
                });
            } else {
                $q->whereHas('categories', fn ($c) => $c->where('categories.slug', $cat));
            }
        }
        if ($brand = (string) ($filters['brand'] ?? '')) {
            if (ctype_digit($brand)) {
                $bid = (int) $brand;
                $q->whereHas('brands', fn ($b) => $b->where('brands.id', $bid));
            } else {
                $q->whereHas('brands', fn ($b) => $b->where('brands.slug', $brand));
            }
        }

        return $q->orderByDesc('id')->limit(self::BATCH_LIMIT)->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array<string, mixed>|null */
    private function previewProduct(int $productId, float $percent): ?array
    {
        $p = Product::query()->with('variants')->find($productId);
        if (! $p) {
            return null;
        }
        if ($p->type === 'variable' && $p->variants->isNotEmpty()) {
            $first = $p->variants->first();
            $regular = (int) ($first->price_minor ?: $p->price_minor);

            return [
                'id' => $p->id,
                'name' => $p->name,
                'image' => $p->image_url ?? '',
                'type' => 'variable',
                'regular_price' => (string) $regular,
                'sale_price' => (string) $this->calcSale($regular, $percent),
                'variations' => $p->variants->count(),
            ];
        }
        $regular = (int) $p->price_minor;
        if ($regular <= 0) {
            return null;
        }

        return [
            'id' => $p->id,
            'name' => $p->name,
            'image' => $p->image_url ?? '',
            'type' => $p->type ?? 'simple',
            'regular_price' => (string) $regular,
            'sale_price' => (string) $this->calcSale($regular, $percent),
        ];
    }

    private function calcSale(int $regular, float $percent): int
    {
        return (int) max(0, round($regular * (1 - ($percent / 100))));
    }

    private function applyProduct(int $productId, float $percent, CarbonInterface $startsAt, CarbonInterface $endsAt): true|string
    {
        $p = Product::query()->with('variants')->find($productId);
        if (! $p) {
            return 'not found';
        }
        if ($p->type === 'variable' && $p->variants->isNotEmpty()) {
            $any = false;
            foreach ($p->variants as $v) {
                $regular = (int) ($v->price_minor ?: 0);
                if ($regular <= 0) {
                    continue;
                }
                $v->sale_price_minor = $this->calcSale($regular, $percent);
                $v->save();
                $any = true;
            }
            if (! $any) {
                return 'skipped';
            }
            $minSale = $p->variants->min(fn (ProductVariant $v) => $v->sale_price_minor ?: PHP_INT_MAX);
            if (is_int($minSale) && $minSale < PHP_INT_MAX) {
                $p->sale_price_minor = $minSale;
            }
            $p->sale_starts_at = $startsAt;
            $p->sale_ends_at = $endsAt;
            $p->save();

            return true;
        }
        $regular = (int) $p->price_minor;
        if ($regular <= 0) {
            return 'skipped';
        }
        $p->sale_price_minor = $this->calcSale($regular, $percent);
        $p->sale_starts_at = $startsAt;
        $p->sale_ends_at = $endsAt;
        $p->save();

        return true;
    }

    private function removeProduct(int $productId): true|string
    {
        $p = Product::query()->with('variants')->find($productId);
        if (! $p) {
            return 'not found';
        }
        if ($p->type === 'variable' && $p->variants->isNotEmpty()) {
            foreach ($p->variants as $v) {
                $v->sale_price_minor = null;
                $v->save();
            }
        }
        $p->sale_price_minor = null;
        $p->sale_starts_at = null;
        $p->sale_ends_at = null;
        $p->save();

        return true;
    }
}
