<?php

namespace App\Services\Cafe;

use App\Models\KitchenStation;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\StationProduct;
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
    /** Station ids this user is assigned to. Empty means "not a station cook". */
    public function stationIdsFor(User $user): array
    {
        return KitchenStation::query()
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
        $productId = (int) $item->product_id;

        $byProduct = StationProduct::query()
            ->whereNotNull('product_id')
            ->where('product_id', $productId)
            ->pluck('station_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($byProduct !== []) {
            return $byProduct;
        }

        $categoryId = $item->product?->category_id;
        if ($categoryId !== null) {
            $byCategory = StationProduct::query()
                ->whereNotNull('category_id')
                ->where('category_id', (int) $categoryId)
                ->pluck('station_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            if ($byCategory !== []) {
                return $byCategory;
            }
        }

        $fallback = KitchenStation::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('kind', KitchenStation::KIND_KITCHEN)
            ->orderBy('sort_order')
            ->value('id');

        return $fallback === null ? [] : [(int) $fallback];
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
