<?php

namespace App\Services\Checkout;

use App\Models\CartItem;
use App\Services\Coupons\CouponService;
use App\Services\GiftCards\GiftCardService;
use App\Services\Membership\MembershipService;
use App\Services\Orders\OrderTax;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Pricing\PurchaseTypeService;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Totals for the stepped checkout, recalculated after every step. Same rules as order creation
 * (purchase type price, coupon, shipping after coupon, special packaging, tax, gift card).
 */
class CheckoutQuote
{
    public function __construct(
        protected ShippingZonesService $shipping,
        protected CouponService $coupons,
        protected GiftCardService $giftCards,
    ) {}

    /**
     * @param  Collection<int, CartItem>  $lines  with product + variant relations
     * @param  array<string, mixed>  $data  values collected so far
     * @return array<string, mixed>
     */
    public function compute(int $tenantId, Collection $lines, array $data, ?int $userId = null): array
    {
        $types = PurchaseTypeService::forTenant($tenantId);
        ['type' => $type, 'months' => $months] = $types->cartType($lines);

        $rows = [];
        $payload = [];
        $subtotal = 0;
        $regularTotal = 0;
        foreach ($lines as $line) {
            if (! $line->product) {
                continue;
            }
            $variant = $line->product_variant_id ? $line->variant : null;
            $rawUnit = $types->unitPrice($line->product, $type, $months, $variant);
            $rawRegular = max($rawUnit, $line->product->regularPriceMinor($variant));
            $unit = \App\Services\Shop\StoreCurrency::toStore($rawUnit, $line->product->currency, $tenantId);
            $regular = \App\Services\Shop\StoreCurrency::toStore($rawRegular, $line->product->currency, $tenantId);
            $subtotal += $unit * $line->quantity;
            $regularTotal += $regular * $line->quantity;
            $payload[] = ['product_id' => $line->product_id, 'product_variant_id' => $line->product_variant_id, 'unit_price_minor' => $unit, 'quantity' => $line->quantity];
            $rows[] = [
                'line_id' => $line->id,
                'product_id' => $line->product_id,
                'product_variant_id' => $line->product_variant_id,
                'name' => $line->product->name,
                'variant_name' => $variant?->name,
                'image_url' => $variant?->image_url ?: ($line->product->image_url ?? null),
                'quantity' => (int) $line->quantity,
                'unit_price_minor' => $unit,
                'regular_price_minor' => $regular,
                'on_sale' => $regular > $unit,
                'line_total_minor' => $unit * $line->quantity,
            ];
        }

        $discount = 0;
        $applied = null;
        $couponError = null;
        $code = trim((string) ($data['coupon_code'] ?? ''));
        try {
            $applied = $code !== ''
                ? $this->coupons->apply($tenantId, $code, $subtotal, $payload, $userId, (string) ($data['channel'] ?? 'site'), [], $data['coupon_password'] ?? null)
                : $this->coupons->bestAutoApply($tenantId, $subtotal, $payload, $userId, (string) ($data['channel'] ?? 'site'));
        } catch (ValidationException $e) {
            $couponError = collect($e->errors())->flatten()->first();
        }
        if ($applied) {
            $discount = (int) $applied['discount_minor'];
        }
        $couponDiscount = $discount;
        $member = app(MembershipService::class)->shopDiscount($tenantId, $userId, $payload);
        $memberMinor = min((int) ($member['discount_minor'] ?? 0), max(0, $subtotal - $couponDiscount));
        $discount = $couponDiscount + $memberMinor;
        $afterDiscount = max(0, $subtotal - $discount);
        $virtual = MembershipService::virtualOnly($lines);

        $addr = is_array($data['shipping_address'] ?? null) ? $data['shipping_address'] : [];
        $state = $data['shipping_state_code'] ?? $addr['state_code'] ?? $addr['state'] ?? null;
        $city = $data['shipping_city'] ?? $addr['city'] ?? null;
        $postcode = $data['shipping_postcode'] ?? $addr['postcode'] ?? null;
        $rates = $virtual ? [] : $this->shipping->quote($tenantId, is_string($state) ? $state : null, is_string($postcode) ? $postcode : null, $afterDiscount, is_string($city) ? $city : null, $lines);
        $picked = null;
        if (! empty($data['shipping_instance_id'])) {
            $picked = collect($rates)->firstWhere('instance_id', (int) $data['shipping_instance_id']);
        }
        $shippingMinor = $picked ? (int) $picked['cost_minor'] : 0;
        $couponShipping = 0;
        if ($applied && $picked) {
            $after = $this->coupons->shippingAfter($applied, $shippingMinor);
            $couponShipping = $shippingMinor - $after;
            $shippingMinor = $after;
        }
        $packMinor = 0;
        $packCfg = ShippingZonesService::sanitizeProfessionalPackaging($this->shipping->getConfig($tenantId)['global']['professional_packaging'] ?? []);
        $proOpt = array_key_exists('professional_packaging', $data) ? (bool) $data['professional_packaging'] : (bool) $packCfg['default_selected'];
        if ($picked) {
            $packMinor = $this->shipping->professionalPackagingFee($tenantId, $proOpt);
            if ($packMinor > 0) {
                $shippingMinor = max(0, $shippingMinor - $this->shipping->cartonReplacedByProfessional($tenantId, $proOpt, (int) ($picked['packaging_minor'] ?? 0))) + $packMinor;
            }
        }
        $tax = OrderTax::compute($tenantId, $afterDiscount, $shippingMinor);
        $beforeGift = max(0, $afterDiscount + $shippingMinor + $tax['added_minor']);

        $gift = null;
        $giftError = null;
        $giftCode = trim((string) ($data['gift_card_code'] ?? ''));
        if ($giftCode !== '') {
            try {
                $p = $this->giftCards->preview($tenantId, $giftCode, $beforeGift);
                $gift = [
                    'code' => $p['card']->maskedCode(),
                    'applied_minor' => $p['applied_minor'],
                    'balance_minor' => $p['balance_minor'],
                    'remaining_minor' => $p['remaining_minor'],
                ];
            } catch (ValidationException $e) {
                $giftError = collect($e->errors())->flatten()->first();
            }
        }
        $giftMinor = (int) ($gift['applied_minor'] ?? 0);
        $payable = max(0, $beforeGift - $giftMinor);
        $cfg = app(CheckoutFlowSettings::class)->get($tenantId);
        $mode = $type === 'installment' ? 'installment' : 'cash';
        $gateways = CheckoutFlowSettings::applyGatewayLayout(
            $cfg,
            app(PaymentGatewaySettingsService::class)->checkoutGateways($tenantId, $mode, $payable)
        );

        return [
            'purchase_type' => $type,
            'installment_months' => $months,
            'single_price' => ! $types->active(),
            'currency' => \App\Services\Shop\StoreCurrency::code($tenantId),
            'lines' => $rows,
            'items_count' => array_sum(array_column($rows, 'quantity')),
            'regular_subtotal_minor' => $regularTotal,
            'sale_savings_minor' => max(0, $regularTotal - $subtotal),
            'subtotal_minor' => $subtotal,
            'coupon' => $applied ? [
                'code' => $applied['coupon']->code,
                'discount_minor' => $discount,
                'free_shipping' => (bool) $applied['free_shipping'],
                'shipping_discount_minor' => $couponShipping,
                'auto' => $code === '',
            ] : null,
            'coupon_error' => $couponError,
            'coupon_discount_minor' => $couponDiscount,
            'membership_discount' => $memberMinor > 0 ? [
                'percent' => $member['percent'],
                'discount_minor' => $memberMinor,
                'label' => __('membership.discount_line', ['percent' => rtrim(rtrim(number_format((float) $member['percent'], 2, '.', ''), '0'), '.')]),
            ] : null,
            'discount_minor' => $discount,
            'requires_shipping' => ! $virtual,
            'shipping_rates' => array_map(fn ($r) => [
                'instance_id' => $r['instance_id'],
                'method_id' => $r['method_id'],
                'title' => $r['title'],
                'cost_minor' => $r['cost_minor'],
                'delivery_time_required' => CheckoutFlowSettings::deliveryTimeApplies($cfg, $r),
            ], $rates),
            'shipping' => $picked ? ['instance_id' => $picked['instance_id'], 'method_id' => $picked['method_id'], 'title' => $picked['title']] : null,
            'shipping_minor' => $shippingMinor,
            'packaging_minor' => $packMinor,
            'tax_minor' => $tax['tax_minor'],
            'tax_added_minor' => $tax['added_minor'],
            'total_before_gift_card_minor' => $beforeGift,
            'gift_card' => $gift,
            'gift_card_error' => $giftError,
            'gift_card_minor' => $giftMinor,
            'total_minor' => $payable,
            'delivery_time_required' => CheckoutFlowSettings::deliveryTimeApplies($cfg, $picked),
            'gateways' => $gateways,
        ];
    }
}
