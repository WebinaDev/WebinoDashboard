<?php

namespace Modules\Cafe\Services;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Modules\Cafe\Entities\CafeDeliveryZone;

/**
 * Delivery fee and minimum order for a given address.
 *
 * Matching is deliberately simple and editable: a zone lists the district/street names it
 * covers, and the first active zone whose area list contains one of the address tokens
 * wins. A geocoded radius exists as a fallback field but is not required for the shop to
 * start taking delivery orders.
 */
final class DeliveryZones
{
    public function __construct(private readonly OperationsSettings $settings) {}

    /** @return Collection<int, CafeDeliveryZone> */
    public function forTenant(int $tenantId, ?int $branchId = null): Collection
    {
        return CafeDeliveryZone::query()
            ->where('tenant_id', $tenantId)
            ->when($branchId !== null, fn ($q) => $q->where(function ($inner) use ($branchId): void {
                $inner->where('branch_id', $branchId)->orWhereNull('branch_id');
            }))
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();
    }

    /**
     * Resolve the zone that covers an address.
     */
    public function resolve(int $tenantId, ?int $branchId, ?string $address): ?CafeDeliveryZone
    {
        if ($address === null || trim($address) === '') {
            return null;
        }

        $needle = $this->normalize($address);

        foreach ($this->forTenant($tenantId, $branchId) as $zone) {
            foreach ((array) ($zone->areas ?? []) as $area) {
                if (! is_string($area) || trim($area) === '') {
                    continue;
                }

                if (str_contains($needle, $this->normalize($area))) {
                    return $zone;
                }
            }
        }

        return null;
    }

    /**
     * Fee and minimum for an address, with the check the till needs before accepting.
     *
     * @return array{zone_id: int|null, zone_name: string|null, fee_minor: int, minimum_minor: int, eta_minutes: int, meets_minimum: bool}
     */
    public function quote(int $tenantId, ?int $branchId, ?string $address, int $subtotalMinor): array
    {
        $cfg = $this->settings->get($tenantId);
        $zone = $this->resolve($tenantId, $branchId, $address);

        if ($zone === null) {
            // No zone means no delivery promise here; the till must say so rather than
            // inventing a fee and hoping.
            return [
                'zone_id' => null,
                'zone_name' => null,
                'fee_minor' => 0,
                'minimum_minor' => 0,
                'eta_minutes' => (int) ($cfg['default_delivery_eta_minutes'] ?? 35),
                'meets_minimum' => false,
                'covered' => false,
            ];
        }

        return [
            'zone_id' => $zone->id,
            'zone_name' => $zone->name_fa,
            'fee_minor' => (int) $zone->delivery_fee_minor,
            'minimum_minor' => (int) $zone->minimum_order_minor,
            'eta_minutes' => (int) ($zone->eta_minutes ?? $cfg['default_delivery_eta_minutes'] ?? 35),
            'meets_minimum' => $subtotalMinor >= (int) $zone->minimum_order_minor,
            'covered' => true,
        ];
    }

    /**
     * Throws when the order is below the zone minimum, unless the shop turned the check off.
     */
    public function assertDeliverable(int $tenantId, ?int $branchId, ?string $address, int $subtotalMinor): array
    {
        $quote = $this->quote($tenantId, $branchId, $address, $subtotalMinor);

        if ($this->settings->bool($tenantId, 'enforce_delivery_minimum') && ! $quote['meets_minimum']) {
            throw ValidationException::withMessages([
                'delivery' => $quote['covered']
                    ? 'The order is below the minimum for this delivery area.'
                    : 'This address is outside the delivery areas.',
            ]);
        }

        return $quote;
    }

    /** Lower-case and strip Persian/Arabic variants so "ولیعصر" and "ولی عصر" match. */
    private function normalize(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['ي', 'ك', '‌'], ['ی', 'ک', ' '], $value);

        return (string) preg_replace('/\s+/', ' ', $value);
    }
}
