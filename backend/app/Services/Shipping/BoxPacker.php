<?php

namespace App\Services\Shipping;

use App\Models\Product;

/**
 * Professional packaging:
 * picks the cheapest configured carton/envelope set that fits cart volume + weight,
 * then adds optional fixed + tape + bubble-wrap fees.
 *
 * Config (shipping global.packaging):
 * {enabled, fixed_cost, tape_enabled, tape_cost, bubble_wrap_enabled, bubble_wrap_cost,
 *  boxes: [...], envelopes: [...]}
 * Each box/envelope: {name, length, width, height (cm), max_weight_g, cost, box_weight_g, kind?}
 */
final class BoxPacker
{
    /**
     * @param  iterable<object>  $lines  cart/order lines with ->product and ->quantity
     * @param  array<string, mixed>  $packaging
     * @return array{boxes: list<array{name: string, items: int, kind?: string}>, cost_minor: int, weight_g: int}|null
     */
    public static function pack(iterable $lines, array $packaging): ?array
    {
        if (empty($packaging['enabled'])) {
            return null;
        }

        $containers = [];
        foreach (array_merge((array) ($packaging['boxes'] ?? []), (array) ($packaging['envelopes'] ?? [])) as $b) {
            if (! is_array($b)) {
                continue;
            }
            if ((float) ($b['length'] ?? 0) <= 0 || (float) ($b['width'] ?? 0) <= 0 || (float) ($b['height'] ?? 0) <= 0) {
                continue;
            }
            $containers[] = $b;
        }
        if ($containers === []) {
            // Fixed / extras only (no dimensional packing).
            $extras = self::extrasCost($packaging, 0);
            if ($extras <= 0) {
                return null;
            }

            return ['boxes' => [], 'cost_minor' => $extras, 'weight_g' => 0];
        }

        usort($containers, fn ($a, $b) => self::vol($a) <=> self::vol($b));

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
                $items[] = [
                    'vol' => $dims[2] > 0 ? $dims[0] * $dims[1] * $dims[2] : 0.0,
                    'dims' => $dims,
                    'w' => ShipmentWeight::unitGrams($p),
                ];
            }
        }
        if ($items === []) {
            $extras = self::extrasCost($packaging, 0);
            if ($extras <= 0) {
                return null;
            }

            return ['boxes' => [], 'cost_minor' => $extras, 'weight_g' => 0];
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
            foreach ($containers as $b) {
                if (self::fits($it, $b)) {
                    $box = $b;
                    break;
                }
            }
            $box ??= end($containers);
            $maxW = (int) ($box['max_weight_g'] ?? 0) ?: PHP_INT_MAX;
            $open[] = [
                'name' => (string) ($box['name'] ?? 'جعبه'),
                'kind' => (string) ($box['kind'] ?? 'carton'),
                'cost' => max(0, (int) ($box['cost'] ?? 0)),
                'vol_left' => self::vol($box) - $it['vol'],
                'w_left' => $maxW - $it['w'],
                'items' => 1,
                'weight' => $it['w'] + max(0, (int) ($box['box_weight_g'] ?? 0)),
            ];
        }

        $boxCost = array_sum(array_column($open, 'cost'));
        $extras = self::extrasCost($packaging, count($open));

        return [
            'boxes' => array_map(fn ($o) => [
                'name' => $o['name'],
                'items' => $o['items'],
                'kind' => $o['kind'],
            ], $open),
            'cost_minor' => $boxCost + $extras,
            'weight_g' => array_sum(array_column($open, 'weight')),
        ];
    }

    private static function extrasCost(array $packaging, int $packageCount): int
    {
        $cost = max(0, (int) ($packaging['fixed_cost'] ?? 0));
        $n = max(1, $packageCount);
        if (! empty($packaging['tape_enabled'])) {
            $cost += max(0, (int) ($packaging['tape_cost'] ?? 0)) * $n;
        }
        if (! empty($packaging['bubble_wrap_enabled'])) {
            $cost += max(0, (int) ($packaging['bubble_wrap_cost'] ?? 0)) * $n;
        }

        return $cost;
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
