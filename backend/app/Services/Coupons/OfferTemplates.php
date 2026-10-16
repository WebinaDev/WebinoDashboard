<?php

namespace App\Services\Coupons;

use App\Models\Coupon;
use Illuminate\Support\Str;

/** Ready-made auto-apply offer templates (port of WP offer engine). Amounts in minor units (IRT). */
class OfferTemplates
{
    public static function all(): array
    {
        $t = fn ($id, $title, $label, $icon, $type, $amount, $ct, $cv, $free = false, $ship = null, $max = null) => compact('id', 'title', 'label', 'icon', 'type', 'amount', 'ct', 'cv', 'free', 'ship', 'max');

        return array_map(fn ($r) => [
            'id' => $r['id'], 'title' => $r['title'], 'condition_label' => $r['label'], 'icon' => $r['icon'],
            'type' => $r['type'], 'amount' => $r['amount'], 'condition_type' => $r['ct'], 'condition_value' => $r['cv'],
            'free_shipping' => $r['free'], 'shipping_percent' => $r['ship'], 'max_discount_minor' => $r['max'],
        ], [
            $t('min_50k_1m', '۵۰,۰۰۰ تومان تخفیف', 'با خرید ۱,۰۰۰,۰۰۰ تومان از فروشگاه', 'coins', 'fixed_cart', 50000, 'min_amount', 1000000),
            $t('min_100k_1_5m', '۱۰۰,۰۰۰ تومان تخفیف', 'با خرید ۱,۵۰۰,۰۰۰ تومان از فروشگاه', 'coins', 'fixed_cart', 100000, 'min_amount', 1500000),
            $t('min_150k_2m', '۱۵۰,۰۰۰ تومان تخفیف', 'با خرید ۲,۰۰۰,۰۰۰ تومان از فروشگاه', 'coins', 'fixed_cart', 150000, 'min_amount', 2000000),
            $t('pct5_2items', '۵٪ تخفیف', 'با خرید ۲ محصول از فروشگاه', 'percent', 'percent', 5, 'min_items', 2, false, null, 1000000),
            $t('pct10_3items', '۱۰٪ تخفیف', 'با خرید ۳ محصول از فروشگاه', 'percent', 'percent', 10, 'min_items', 3, false, null, 1000000),
            $t('ship50_800k', '۵۰٪ تخفیف ارسال', 'با خرید ۸۰۰,۰۰۰ تومان از فروشگاه', 'truck', 'fixed_cart', 0, 'min_amount', 800000, false, 50),
            $t('freeship_order1', 'ارسال رایگان', 'برای سفارش اول از فروشگاه', 'truck', 'fixed_cart', 0, 'order_nth', 1, true),
            $t('pct15_order2', '۱۵٪ تخفیف', 'برای سفارش دوم از فروشگاه', 'percent', 'percent', 15, 'order_nth', 2, false, null, 1000000),
            $t('pct10_order3', '۱۰٪ تخفیف', 'برای سفارش سوم از فروشگاه', 'percent', 'percent', 10, 'order_nth', 3, false, null, 1000000),
        ]);
    }

    public static function find(string $id): ?array
    {
        return collect(self::all())->firstWhere('id', $id);
    }

    /** Create (or return existing) auto-apply coupon for a template. */
    public static function createFor(int $tenantId, string $id): ?Coupon
    {
        $tpl = self::find($id);
        if (! $tpl) {
            return null;
        }
        $existing = Coupon::query()->where('tenant_id', $tenantId)->where('status', '!=', 'trash')
            ->whereJsonContains('restrictions->offer_template', $id)->first();
        if ($existing) {
            return $existing;
        }

        return Coupon::query()->create([
            'tenant_id' => $tenantId,
            'code' => 'OFFER-'.strtoupper(Str::random(6)),
            'type' => $tpl['type'],
            'amount' => $tpl['amount'],
            'free_shipping' => $tpl['free_shipping'],
            'shipping_percent' => $tpl['shipping_percent'],
            'max_discount_minor' => $tpl['max_discount_minor'],
            'condition_type' => $tpl['condition_type'],
            'condition_value' => $tpl['condition_value'],
            'auto_apply' => true,
            'status' => 'publish',
            'description' => $tpl['title'].' — '.$tpl['condition_label'],
            'restrictions' => ['offer_template' => $id],
        ]);
    }
}
