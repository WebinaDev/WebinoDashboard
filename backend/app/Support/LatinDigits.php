<?php

namespace App\Support;

final class LatinDigits
{
    public static function normalize(mixed $value): string
    {
        $text = trim((string) $value);
        $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $latin = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        return str_replace([...$persian, ...$arabic], [...$latin, ...$latin], $text);
    }

    public static function int(mixed $value): int
    {
        $text = self::normalize($value);
        $text = str_replace([',', '٬', ' '], '', $text);
        if ($text === '' || ! is_numeric($text)) {
            return 0;
        }

        return (int) $text;
    }
}
