<?php

namespace App\Services\Marketplace\Basalam;

/**
 * Strips words Basalam rejected in a product description (port of DescriptionErrorSanitizer).
 */
final class BasalamDescriptionSanitizer
{
    private const SEPARATOR = '[\s\x{200c}\x{00a0}\-\_\.\–\—]*';

    /** @return list<string> Flagged values, longest first. */
    public static function extract(array $response): array
    {
        $values = [];
        foreach ((array) ($response['messages'] ?? []) as $message) {
            if (! is_array($message) || ! in_array('description', (array) ($message['fields'] ?? []), true)) {
                continue;
            }
            foreach ((array) ($message['detected'] ?? []) as $item) {
                foreach (self::valuesFromItem($item) as $value) {
                    $values[$value] = $value;
                }
            }
        }
        $values = array_values($values);
        usort($values, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));

        return $values;
    }

    /** @return list<string> */
    private static function valuesFromItem(mixed $item): array
    {
        if (is_string($item)) {
            $item = trim($item);

            return $item !== '' ? [$item] : [];
        }
        if (! is_array($item)) {
            return [];
        }
        $found = [];
        $snippet = $item['snippet'] ?? '';
        if (is_string($snippet) && $snippet !== '' && preg_match_all('/<em>(.*?)<\/em>/isu', $snippet, $m)) {
            foreach ($m[1] as $match) {
                $value = trim(strip_tags(html_entity_decode($match, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
                if ($value === '') {
                    continue;
                }
                $found[] = $value;
                if (preg_match_all('/[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)+/u', $value, $tokens)) {
                    foreach ($tokens[0] as $token) {
                        if (mb_strlen($token) >= 3) {
                            $found[] = $token;
                        }
                    }
                }
            }
        }
        $value = $item['value'] ?? '';
        if (is_string($value) && trim($value) !== '') {
            $found[] = trim($value);
        }

        return $found;
    }

    /** @param  list<string>  $values */
    public static function sanitize(string $description, array $values): string
    {
        $result = $description;
        foreach ($values as $value) {
            if (is_string($value)) {
                $result = self::removeValue($result, $value);
            }
        }
        $result = preg_replace('/[ \t]{2,}/u', ' ', $result) ?? $result;
        $result = preg_replace('/\n{3,}/u', "\n\n", $result) ?? $result;

        return trim($result);
    }

    private static function removeValue(string $text, string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return $text;
        }
        $segments = preg_split('/[\s\x{200c}\x{00a0}\-\_\.\–\—]+/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($segments) {
            $pattern = '/'.implode(self::SEPARATOR, array_map(fn ($s) => preg_quote($s, '/'), $segments)).'/iu';
            if (@preg_match($pattern, '') !== false) {
                $replaced = preg_replace($pattern, ' ', $text);
                if (is_string($replaced) && $replaced !== $text) {
                    return $replaced;
                }
            }
        }

        return str_ireplace($value, ' ', $text);
    }
}
