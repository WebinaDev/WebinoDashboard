<?php

namespace App\Services\Shipping;

use App\Models\Product;

/**
 * Professional packaging (port of WP shipping-module packer/packaging):
 * picks the cheapest configured box set that fits cart volume + weight.
 * Greedy first-fit-decreasing by volume; items without dimensions count as weight only.
 *
 * Box config (shipping global.packaging): {enabled, boxes: [{name, length, width, height (cm), max_weight_g, cost, box_weight_g}]}
 */
final class BoxPacker
{
    /**
     * @param  iterable<object>  $lines  cart/order lines with ->product and ->quantity
     * @param  array<string, mixed>  $packaging
     * @return array{boxes: list<array{name: string, items: int}>, cost_minor: int, weight_g: int}|null
     */
    public static function pack(iterable $lines, array $packaging): ?array
    {
        $boxes = array_values(array_filter((array) ($packaging['boxes'] ?? []), fn ($b) => is_array($b) && (float) ($b['length'] ?? 0) > 0 && (float) ($b['width'] ?? 0) > 0 && (float) ($b['height'] ?? 0) > 0));
        if (empty($packaging['enabled']) || $boxes === []) {
            return null;
        }
        // Sort boxes by volume asc so we try small boxes first.
        usort($boxes, fn ($a, $b) => self::vol($a) <=> self::vol($b));

        $items = [];
        foreach ($lines as $line) {
            $p = $line->product ?? null;
            if (! $p instanceof Product) {
                continue;
            }
            $qty = max(1, (int) ($line->quantity ?? 1));
            $dims = [(float) $p->length, (float) $p->width, (float) $p->height];
            rsort($dims);
            for ($i = 0; $i < $qty; $i++) {
                $items[] = ['vol' => $dims[2] > 0 ? $dims[0] * $dims[1] * $dims[2] : 0.0, 'dims' => $dims, 'w' => ShipmentWeight::unitGrams($p)];
            }
        }
        if ($items === []) {
            return null;
        }
        usort($items, fn ($a, $b) => $b['vol'] <=> $a['vol']);

        $open = [];
        foreach ($items as $it) {
            $placed = false;
            foreach ($open as &$o) {
                if ($o['vol_left'] >= $it['vol'] && $o['w_left'] >= $it['w']) {
                    $o['vol_left'] -= $it['vol'];
                    $o['w_left'] -= $it['w'];
                    $o['items']++;
                    $o['weight'] += $it['w'];
                    $placed = true;
                    break;
                }
            }
            unset($o);
            if ($placed) {
                continue;
            }
            $box = null;
            foreach ($boxes as $b) {
                if (self::fits($it, $b)) {
                    $box = $b;
                    break;
                }
            }
            $box ??= end($boxes); // oversized item: largest box (carrier will charge by weight)
            $maxW = (int) ($box['max_weight_g'] ?? 0) ?: PHP_INT_MAX;
            $open[] = [
                'name' => (string) ($box['name'] ?? 'جعبه'),
                'cost' => max(0, (int) ($box['cost'] ?? 0)),
                'vol_left' => self::vol($box) - $it['vol'],
                'w_left' => $maxW - $it['w'],
                'items' => 1,
                'weight' => $it['w'] + max(0, (int) ($box['box_weight_g'] ?? 0)),
            ];
        }

        return [
            'boxes' => array_map(fn ($o) => ['name' => $o['name'], 'items' => $o['items']], $open),
            'cost_minor' => array_sum(array_column($open, 'cost')),
            'weight_g' => array_sum(array_column($open, 'weight')),
        ];
    }

    private static function vol(array $b): float
    {
        return (float) $b['length'] * (float) $b['width'] * (float) $b['height'];
    }

    private static function fits(array $item, array $box): bool
    {
        $bd = [(float) $box['length'], (float) $box['width'], (float) $box['height']];
        rsort($bd);
        $maxW = (int) ($box['max_weight_g'] ?? 0);
        if ($maxW > 0 && $item['w'] > $maxW) {
            return false;
        }

        return $item['dims'][0] <= $bd[0] && $item['dims'][1] <= $bd[1] && $item['dims'][2] <= $bd[2];
    }
}
