<?php

namespace App\Services\Orders;

/**
 * Scannable Code128-B barcodes as SVG (printable ASCII only).
 */
final class Code128Barcode
{
    private const PATTERNS = [
        '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100',
        '10001100100', '11001001000', '11001000100', '11000100100', '10110011100', '10011011100', '10011001111', '10111001100',
        '10011101100', '10011100110', '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
        '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', '11011011000', '11011000110',
        '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
        '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
        '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110',
        '11100010110', '11101101000', '11101100010', '11100011010', '11101111010', '11001000010', '11110001010', '10100110000',
        '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
        '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
        '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100',
        '11110010010', '11011011110', '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
        '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110', '11110101110', '11010000100',
        '11010010000', '11010011100', '1100011101011',
    ];

    /** @return list<int>|null */
    public static function encode(string $text): ?array
    {
        if ($text === '') {
            return null;
        }
        $codes = [104];
        $len = strlen($text);
        for ($i = 0; $i < $len; $i++) {
            $ord = ord($text[$i]);
            if ($ord < 32 || $ord > 126) {
                return null;
            }
            $codes[] = $ord - 32;
        }
        $checksum = $codes[0];
        for ($i = 1, $n = count($codes); $i < $n; $i++) {
            $checksum += $codes[$i] * $i;
        }
        $codes[] = $checksum % 103;
        $codes[] = 106;

        return $codes;
    }

    public static function svg(string $text): string
    {
        $text = (string) preg_replace('/\s+/', '', $text);
        $codes = self::encode($text);
        if ($codes === null) {
            return '';
        }

        $module = 2;
        $height = 48;
        $quiet = 10 * $module;
        $x = $quiet;
        $bars = '';
        foreach ($codes as $code) {
            $pattern = self::PATTERNS[$code];
            $len = strlen($pattern);
            for ($i = 0; $i < $len; $i++) {
                if ($pattern[$i] === '1') {
                    $bars .= '<rect x="'.$x.'" y="0" width="'.$module.'" height="'.$height.'" fill="#000"/>';
                }
                $x += $module;
            }
        }
        $width = $x + $quiet;
        $total = $height + 20;

        return '<svg xmlns="http://www.w3.org/2000/svg" width="'.$width.'" height="'.$total.'" viewBox="0 0 '.$width.' '.$total.'">'
            .$bars
            .'<text x="'.($width / 2).'" y="'.($height + 14).'" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">'
            .htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8').'</text></svg>';
    }

    public static function dataUri(string $text): string
    {
        $svg = self::svg($text);

        return $svg === '' ? '' : 'data:image/svg+xml;base64,'.base64_encode($svg);
    }
}
