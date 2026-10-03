<?php

namespace App\Services\Pricing;

use App\Kernel\ModuleAliasMap;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\TenantModule;
use App\Models\TenantSubmoduleActivation;
use Illuminate\Support\Collection;

/**
 * Storefront purchase types (port of WFCP_Cart_Manager + WFCP_Gateway_Filter).
 *
 * The cart has a single effective type: any wholesale line makes it wholesale, otherwise the lines' type.
 */
class PurchaseTypeService
{
    protected ?bool $moduleActive = null;

    public function __construct(protected int $tenantId, protected PricingCalculator $calc) {}

    public static function forTenant(int $tenantId): self
    {
        return new self($tenantId, PricingCalculator::forTenant($tenantId));
    }

    public function calculator(): PricingCalculator
    {
        return $this->calc;
    }

    public function active(): bool
    {
        if (! PricingCalculator::bool($this->calc->section('general')['enabled'] ?? true)) {
            return false;
        }

        return $this->moduleActive ??= self::moduleEnabled($this->tenantId);
    }

    protected static function moduleEnabled(int $tenantId): bool
    {
        $resolved = ModuleAliasMap::resolve('pricing');
        if ($resolved !== null) {
            [$module, $sub] = $resolved;
            $row = TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenantId)->where('module_slug', $module)->where('submodule_slug', $sub)->first();

            return (bool) ($row?->enabled && $row->licensed !== false);
        }
        $row = TenantModule::query()->where('tenant_id', $tenantId)->where('module_slug', 'pricing')->first();

        return (bool) ($row?->enabled && $row->licensed !== false);
    }

    public function normalize(?string $type): string
    {
        return $this->active() ? $this->calc->normalizePurchaseType($type ?: $this->calc->defaultPurchaseType()) : 'cash';
    }

    public function normalizeMonths(string $type, ?int $months): ?int
    {
        if ($type !== 'installment') {
            return null;
        }
        $plans = array_column($this->calc->installmentPlans(), 'months');
        if ($months && in_array($months, $plans, true)) {
            return $months;
        }

        return $this->calc->defaultInstallmentMonths();
    }

    /**
     * @param  Collection<int, CartItem>  $lines
     * @return array{type: string, months: int|null}
     */
    public function cartType(Collection $lines): array
    {
        if (! $this->active() || $lines->isEmpty()) {
            return ['type' => 'cash', 'months' => null];
        }
        if ($lines->contains(fn (CartItem $l) => $l->purchase_type === 'wholesale') && $this->calc->typeEnabled('wholesale')) {
            return ['type' => 'wholesale', 'months' => null];
        }
        $first = $lines->first(fn (CartItem $l) => $l->purchase_type !== null);
        $type = $this->normalize($first?->purchase_type);

        return ['type' => $type, 'months' => $this->normalizeMonths($type, $first?->installment_months)];
    }

    /**
     * Stamp every cart line with one purchase type (WFCP switches the whole cart).
     */
    public function applyToCart(Cart $cart, string $type, ?int $months = null): void
    {
        $type = $this->normalize($type);
        CartItem::query()->where('cart_id', $cart->id)->update([
            'purchase_type' => $type,
            'installment_months' => $this->normalizeMonths($type, $months),
        ]);
    }

    public function unitPrice(Product $product, string $type, ?int $months = null): int
    {
        if (! $this->active()) {
            return $product->storefrontPriceMinor();
        }

        return $this->calc->unitPrice($product, null, $type, (int) $months);
    }

    /**
     * @param  Collection<int, CartItem>  $lines
     * @return array<string, mixed>
     */
    public function quote(Collection $lines): array
    {
        ['type' => $type, 'months' => $months] = $this->cartType($lines);
        $rows = [];
        $subtotal = 0;
        foreach ($lines as $line) {
            if (! $line->product) {
                continue;
            }
            $unit = $this->unitPrice($line->product, $type, $months);
            $subtotal += $unit * $line->quantity;
            $rows[] = ['id' => $line->id, 'product_id' => $line->product_id, 'unit_price_minor' => $unit, 'line_total_minor' => $unit * $line->quantity];
        }

        return [
            'active' => $this->active(),
            'purchase_type' => $type,
            'installment_months' => $months,
            'installment_monthly_minor' => $months ? (int) round($subtotal / $months) : null,
            'available_types' => $this->active() ? $this->calc->enabledPurchaseTypes() : ['cash'],
            'installment_plans' => $this->active() ? $this->calc->installmentPlans() : [],
            'allowed_gateways' => $this->active() ? $this->calc->gatewaysFor($type) : [],
            'subtotal_minor' => $subtotal,
            'lines' => $rows,
        ];
    }

    public function gatewayAllowed(string $type, string $gateway): bool
    {
        return ! $this->active() || $this->calc->gatewayAllowed($type, $gateway);
    }

    /**
     * Public product payload: per-type prices + installment table (never exposes the purchase price).
     *
     * @return array<string, mixed>|null
     */
    public function productPricing(Product $product): ?array
    {
        if (! $this->active() || ! $product->purchase_price_minor) {
            return null;
        }
        $types = [];
        foreach ($this->calc->enabledPurchaseTypes() as $type) {
            $types[$type] = $this->unitPrice($product, $type, $type === 'installment' ? $this->calc->defaultInstallmentMonths() : null);
        }

        return [
            'default_type' => $this->calc->defaultPurchaseType(),
            'types' => $types,
            'installments' => array_map(fn (array $r) => [
                'months' => $r['months'],
                'monthly_minor' => (int) round($r['monthly']),
                'total_minor' => (int) round($r['total']),
            ], $this->calc->installmentTable((float) $product->purchase_price_minor, $product)),
        ];
    }
}
