<?php

namespace Modules\Cafe\Services;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Answers "whose station does this ticket belong to?".
 *
 * Routing is by explicit product assignment first, then by category, and finally by the
 * fallback station. That order matters: a bar item that lives in a shared "drinks" category
 * still lands on the bar even if the category was later re-pointed at the pass.
 */
final class KitchenStations
{
    /**
     * Per-request routing caches.
     *
     * Routing used to be answered one line at a time: a 40-line board over a three-station
     * kitchen ran ~120 queries before a single ticket was rendered, and the kitchen polled it
     * every 8 seconds. The whole routing table for a tenant is a few dozen rows, so it is read
     * once and answered from memory. A new service instance is built per request, so the cache
     * cannot outlive the data it was read from by more than one poll.
     *
     * @var array<int, array{products: array<int, list<int>>, categories: array<int, list<int>>, fallback: int|null}>
     */
    private array $routing = [];

    /** @var array<int, list<int>> */
    private array $stationCache = [];

    /** Station ids this user is assigned to. Empty means "not a station cook". */
    public function stationIdsFor(User $user): array
    {
        $key = (int) $user->id;

        if (isset($this->stationCache[$key])) {
            return $this->stationCache[$key];
        }

        return $this->stationCache[$key] = KitchenStation::query()
            ->where('tenant_id', $user->tenant_id)
            ->whereHas('users', fn ($q) => $q->where('users.id', $user->id))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function hasStations(int $tenantId): bool
    {
        return KitchenStation::query()->where('tenant_id', $tenantId)->exists();
    }

    /**
     * The stations that should see one order line.
     *
     * @return list<int>
     */
    public function stationsForItem(int $tenantId, OrderItem $item): array
    {
        $routing = $this->routingFor($tenantId);

        $byProduct = $routing['products'][(int) $item->product_id] ?? [];

        if ($byProduct !== []) {
            return $byProduct;
        }

        $categoryId = $item->product?->category_id;
        if ($categoryId !== null) {
            $byCategory = $routing['categories'][(int) $categoryId] ?? [];

            if ($byCategory !== []) {
                return $byCategory;
            }
        }

        return $routing['fallback'] === null ? [] : [$routing['fallback']];
    }

    /**
     * The tenant's routing table, read once.
     *
     * Product rows win over category rows, which is the documented precedence, so both maps are
     * kept separately rather than merged.
     *
     * @return array{products: array<int, list<int>>, categories: array<int, list<int>>, fallback: int|null}
     */
    private function routingFor(int $tenantId): array
    {
        if (isset($this->routing[$tenantId])) {
            return $this->routing[$tenantId];
        }

        $products = [];
        $categories = [];

        $rows = StationProduct::query()
            ->where(fn ($q) => $q->whereNotNull('product_id')->orWhereNotNull('category_id'))
            ->get(['station_id', 'product_id', 'category_id']);

        // A station may be switched off: routing must not send tickets to a station that is not
        // cooking, or the board silently holds work nobody is looking at.
        $active = KitchenStation::query()
            ->where('tenant_id', $tenantId)
            ->pluck('is_active', 'id');

        foreach ($rows as $row) {
            $stationId = (int) $row->station_id;

            // Routing rows carry no tenant of their own, so an active station in *this* tenant is
            // what tells us the row is ours — and that somebody is actually cooking at it.
            if (! $active->has($stationId) || (int) $active[$stationId] !== 1) {
                continue;
            }

            if ($row->product_id !== null && (int) $row->product_id !== 0) {
                $products[(int) $row->product_id][] = $stationId;

                continue;
            }

            if ($row->category_id !== null && (int) $row->category_id !== 0) {
                $categories[(int) $row->category_id][] = $stationId;
            }
        }

        $fallback = KitchenStation::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('kind', KitchenStation::KIND_KITCHEN)
            ->orderBy('sort_order')
            ->value('id');

        return $this->routing[$tenantId] = [
            'products' => $products,
            'categories' => $categories,
            'fallback' => $fallback === null ? null : (int) $fallback,
        ];
    }

    /**
     * Whether an order has any line routed to one of the given stations.
     *
     * Used to keep an order off a station board when another station owns all of it.
     */
    public function orderTouchesStations(int $tenantId, Order $order, array $stationIds): bool
    {
        if ($stationIds === []) {
            return true; // no assignment means unrestricted (manager, admin)
        }

        $order->loadMissing('items.product:id,category_id');

        /** @var Collection<int, OrderItem> $items */
        $items = $order->items;

        foreach ($items as $item) {
            if (array_intersect($this->stationsForItem($tenantId, $item), $stationIds) !== []) {
                return true;
            }
        }

        return false;
    }

    /** Only the lines this station is responsible for — the cook should not read the whole ticket. */
    public function filterItemsForStations(int $tenantId, Order $order, array $stationIds): Order
    {
        if ($stationIds === []) {
            return $order;
        }

        $order->loadMissing('items.product:id,category_id');

        $kept = $order->items->filter(
            fn (OrderItem $item): bool => array_intersect($this->stationsForItem($tenantId, $item), $stationIds) !== []
        )->values();

        $order->setRelation('items', $kept);

        return $order;
    }
}
