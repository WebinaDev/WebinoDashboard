<?php

namespace App\Services\Shop;

/**
 * Lightweight Persian profanity filter for UGC (reviews, tickets).
 */
class PersianProfanityFilter
{
    /** @var list<string> */
    protected static array $blocked = [
        'کس', 'کیر', 'جنده', 'حرومزاده', 'مادرجنده', 'لاشی', 'دیوس', 'سگ پدر',
        'fuck', 'shit', 'bitch',
    ];

    public function containsProfanity(?string $text): bool
    {
        $text = mb_strtolower(trim((string) $text));
        if ($text === '') {
            return false;
        }
        $normalized = preg_replace('/\s+/u', '', $text) ?? $text;
        foreach (self::$blocked as $word) {
            $w = mb_strtolower($word);
            if ($w !== '' && (str_contains($text, $w) || str_contains($normalized, $w))) {
                return true;
            }
        }

        return false;
    }

    public function rejectMessage(): string
    {
        return __('ishop.profanity_rejected');
    }
}
