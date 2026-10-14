<?php

namespace App\Support;

/** Iranian national code (کد ملی) normalisation + checksum validation. */
class IranNationalId
{
    public static function normalize(?string $value): string
    {
        return preg_replace('/\D/', '', LatinDigits::normalize((string) $value)) ?? '';
    }

    public static function isValid(?string $value): bool
    {
        $code = self::normalize($value);
        if (! preg_match('/^\d{10}$/', $code) || preg_match('/^(\d)\1{9}$/', $code)) {
            return false;
        }
        $sum = 0;
        for ($i = 0; $i < 9; $i++) {
            $sum += ((int) $code[$i]) * (10 - $i);
        }
        $rem = $sum % 11;
        $check = (int) $code[9];

        return $rem < 2 ? $check === $rem : $check === 11 - $rem;
    }
}
