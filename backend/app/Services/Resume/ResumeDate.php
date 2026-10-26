<?php

namespace App\Services\Resume;

/** ResumeDate = {g: "YYYY[-MM[-DD]]", j: "YYYY[-MM[-DD]]", precision: year|month|day}. Both calendars are stored. */
class ResumeDate
{
    public static function normalize(mixed $d): ?array
    {
        if (! is_array($d) || (empty($d['g']) && empty($d['j']))) {
            return null;
        }
        $src = ! empty($d['j']) ? 'j' : 'g';
        $parts = array_map('intval', explode('-', (string) $d[$src]));
        $precision = $d['precision'] ?? (count($parts) >= 3 ? 'day' : (count($parts) === 2 ? 'month' : 'year'));
        [$y, $m, $day] = [$parts[0], $parts[1] ?? 1, $parts[2] ?? 1];
        [$oy, $om, $od] = $src === 'j' ? Jalali::toGregorian($y, $m, $day) : Jalali::toJalali($y, $m, $day);
        if ($precision === 'year') {
            // A bare year maps to the year the other calendar mostly overlaps (Jalali +621).
            $other = (string) ($src === 'j' ? $y + 621 : $y - 621);
            $mine = sprintf('%04d', $y);
        } else {
            $fmt = $precision === 'month' ? '%04d-%02d' : '%04d-%02d-%02d';
            $mine = sprintf($fmt, $y, $m, $day);
            $other = sprintf($fmt, $oy, $om, $od);
        }

        return $src === 'j'
            ? ['g' => $other, 'j' => $mine, 'precision' => $precision]
            : ['g' => $mine, 'j' => $other, 'precision' => $precision];
    }

    public static function months(?array $start, ?array $end): ?int
    {
        if (! $start || empty($start['g'])) {
            return null;
        }
        $s = array_map('intval', explode('-', $start['g'])) + [1 => 1];
        $e = $end && ! empty($end['g']) ? array_map('intval', explode('-', $end['g'])) + [1 => 1] : [(int) date('Y'), (int) date('n')];

        return max(0, ($e[0] - $s[0]) * 12 + (($e[1] ?? 1) - ($s[1] ?? 1)) + 1);
    }
}
