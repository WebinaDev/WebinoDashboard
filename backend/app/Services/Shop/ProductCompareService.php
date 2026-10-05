<?php

namespace App\Services\Shop;

use App\Models\Product;
use App\Models\ProductCompareSession;
use Illuminate\Http\Request;

class ProductCompareService
{
    public const MAX_ITEMS = 4;

    public function resolveSession(int $tenantId, Request $request): ProductCompareSession
    {
        $user = $request->user('sanctum');
        if ($user && (int) $user->tenant_id === $tenantId) {
            return ProductCompareSession::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'user_id' => $user->id],
                ['product_ids' => [], 'guest_token' => null]
            );
        }

        $token = $this->guestToken($request);
        if ($token === '') {
            $token = bin2hex(random_bytes(16));
        }

        return ProductCompareSession::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'guest_token' => $token],
            ['product_ids' => [], 'user_id' => null]
        );
    }

    public function guestToken(Request $request): string
    {
        $header = trim((string) $request->header('X-Compare-Token', ''));
        if ($header !== '' && preg_match('/^[a-f0-9]{32}$/', $header)) {
            return $header;
        }
        $cookie = trim((string) $request->cookie('compare_token', ''));

        return preg_match('/^[a-f0-9]{32}$/', $cookie) ? $cookie : '';
    }

    /** @return list<int> */
    public function ids(ProductCompareSession $session): array
    {
        $raw = is_array($session->product_ids) ? $session->product_ids : [];

        return array_values(array_unique(array_filter(array_map('intval', $raw))));
    }

    /** @return array{session: ProductCompareSession, ids: list<int>, guest_token: string|null} */
    public function add(int $tenantId, Request $request, int $productId): array
    {
        abort_unless(
            Product::query()->where('tenant_id', $tenantId)->where('id', $productId)->storefront()->exists(),
            404
        );
        $session = $this->resolveSession($tenantId, $request);
        $ids = $this->ids($session);
        if (! in_array($productId, $ids, true)) {
            $ids[] = $productId;
            $ids = array_slice($ids, 0, self::MAX_ITEMS);
        }
        $session->product_ids = $ids;
        $session->save();

        return [
            'session' => $session,
            'ids' => $ids,
            'guest_token' => $session->guest_token,
        ];
    }

    /** @return array{session: ProductCompareSession, ids: list<int>, guest_token: string|null} */
    public function remove(int $tenantId, Request $request, int $productId): array
    {
        $session = $this->resolveSession($tenantId, $request);
        $ids = array_values(array_filter($this->ids($session), fn ($id) => $id !== $productId));
        $session->product_ids = $ids;
        $session->save();

        return [
            'session' => $session,
            'ids' => $ids,
            'guest_token' => $session->guest_token,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function products(int $tenantId, array $ids, ?string $search = null): array
    {
        if ($ids === []) {
            return [];
        }
        $q = Product::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $ids)
            ->storefront()
            ->with(['category', 'brands']);
        if ($search !== null && trim($search) !== '') {
            $term = trim($search);
            $q->where(fn ($b) => $b->where('name', 'like', "%{$term}%")->orWhere('sku', 'like', "%{$term}%"));
        }

        return $q->get()->map(fn (Product $p) => [
            'id' => $p->id,
            'slug' => $p->slug,
            'name' => $p->name,
            'price_minor' => $p->storefrontPriceMinor(),
            'regular_price_minor' => (int) $p->price_minor,
            'image_url' => $p->cover_image_url ?: $p->image_url,
            'brand' => $p->brands->first()?->name,
            'category' => $p->category?->name,
            'attributes' => [],
            'stock' => $p->stock,
            'in_stock' => $p->is_available && ! $p->is_sold_out,
        ])->values()->all();
    }
}
