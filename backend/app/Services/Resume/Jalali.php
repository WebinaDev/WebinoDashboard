<?php

namespace App\Services\Resume;

/** Jalali ⇄ Gregorian (jalaali-js algorithm, valid 1-3177 AP). */
class Jalali
{
    private const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

    private static function div(int $a, int $b): int
    {
        return intdiv($a, $b);
    }

    private static function jalCal(int $jy): array
    {
        $bl = count(self::BREAKS);
        $gy = $jy + 621;
        $leapJ = -14;
        $jp = self::BREAKS[0];
        $jump = 0;
        for ($i = 1; $i < $bl; $i++) {
            $jm = self::BREAKS[$i];
            $jump = $jm - $jp;
            if ($jy < $jm) {
                break;
            }
            $leapJ += self::div($jump, 33) * 8 + self::div($jump % 33, 4);
            $jp = $jm;
        }
        $n = $jy - $jp;
        $leapJ += self::div($n, 33) * 8 + self::div(($n % 33) + 3, 4);
        if ($jump % 33 === 4 && $jump - $n === 4) {
            $leapJ++;
        }
        $leapG = self::div($gy, 4) - self::div((self::div($gy, 100) + 1) * 3, 4) - 150;
        $march = 20 + $leapJ - $leapG;
        if ($jump - $n < 6) {
            $n = $n - $jump + self::div($jump + 4, 33) * 33;
        }
        $leap = ((($n + 1) % 33) - 1) % 4;
        if ($leap === -1) {
            $leap = 4;
        }

        return ['leap' => $leap, 'gy' => $gy, 'march' => $march];
    }

    private static function g2d(int $gy, int $gm, int $gd): int
    {
        $d = self::div(($gy + self::div($gm - 8, 6) + 100100) * 1461, 4) + self::div(153 * (($gm + 9) % 12) + 2, 5) + $gd - 34840408;

        return $d - self::div(self::div($gy + 100100 + self::div($gm - 8, 6), 100) * 3, 4) + 752;
    }

    private static function d2g(int $jdn): array
    {
        $j = 4 * $jdn + 139361631;
        $j = $j + self::div(self::div(4 * $jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
        $i = self::div($j % 1461, 4) * 5 + 308;
        $gd = self::div($i % 153, 5) + 1;
        $gm = (self::div($i, 153) % 12) + 1;
        $gy = self::div($j, 1461) - 100100 + self::div(8 - $gm, 6);

        return [$gy, $gm, $gd];
    }

    private static function j2d(int $jy, int $jm, int $jd): int
    {
        $r = self::jalCal($jy);

        return self::g2d($r['gy'], 3, $r['march']) + ($jm - 1) * 31 - self::div($jm, 7) * ($jm - 7) + $jd - 1;
    }

    private static function d2j(int $jdn): array
    {
        [$gy] = self::d2g($jdn);
        $jy = $gy - 621;
        $r = self::jalCal($jy);
        $jdn1f = self::g2d($gy, 3, $r['march']);
        $k = $jdn - $jdn1f;
        if ($k >= 0) {
            if ($k <= 185) {
                return [$jy, 1 + self::div($k, 31), ($k % 31) + 1];
            }
            $k -= 186;
        } else {
            $jy -= 1;
            $k += 179;
            if ($r['leap'] === 1) {
                $k += 1;
            }
        }

        return [$jy, 7 + self::div($k, 30), ($k % 30) + 1];
    }

    /** @return array{int,int,int} */
    public static function toJalali(int $gy, int $gm, int $gd): array
    {
        return self::d2j(self::g2d($gy, $gm, $gd));
    }

    /** @return array{int,int,int} */
    public static function toGregorian(int $jy, int $jm, int $jd): array
    {
        return self::d2g(self::j2d($jy, $jm, $jd));
    }
}
