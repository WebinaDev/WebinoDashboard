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
        // Both calendars given: keep them exactly as entered (converting a month-precision Jalali date
        // from its 1st day would otherwise shift the Gregorian month, e.g. Tir 1405 -> Jun instead of Jul).
        if (! empty($d['g']) && ! empty($d['j'])) {
            $cnt = max(count(explode('-', (string) $d['g'])), count(explode('-', (string) $d['j'])));
            $precision = $d['precision'] ?? ($cnt >= 3 ? 'day' : ($cnt === 2 ? 'month' : 'year'));

            return ['g' => (string) $d['g'], 'j' => (string) $d['j'], 'precision' => $precision];
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
