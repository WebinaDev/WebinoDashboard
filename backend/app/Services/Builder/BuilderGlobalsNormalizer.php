<?php

namespace App\Services\Builder;

class BuilderGlobalsNormalizer
{
    /** @return array<string, mixed> */
    public function defaults(): array
    {
        $type = fn (string $size, string $weight, string $leading, ?string $color = null) => array_filter([
            'fontSize' => $size,
            'fontWeight' => $weight,
            'lineHeight' => $leading,
            'color' => $color,
        ]);

        return [
            'colors' => [
                'primary' => '#E16BA6',
                'secondary' => '#0C2D63',
                'text' => '#0C2D63',
                'accent' => '#E16BA6',
                'background' => '#F5F8FB',
                'surface' => '#FFFFFF',
                'border' => '#E6EEF6',
                'muted' => '#5C6B82',
                'success' => '#1F8A70',
                'danger' => '#C2414A',
            ],
            'palette' => [
                ['id' => 'blush', 'name' => 'سرخابی', 'value' => '#E16BA6'],
                ['id' => 'navy', 'name' => 'سرمه‌ای', 'value' => '#0C2D63'],
                ['id' => 'mist', 'name' => 'مه', 'value' => '#F5F8FB'],
                ['id' => 'ink', 'name' => 'مرکب', 'value' => '#101820'],
            ],
            'fonts' => [
                'body' => 'Yekan Bakh, Vazirmatn, Tahoma, sans-serif',
                'heading' => 'Yekan Bakh, Vazirmatn, Tahoma, sans-serif',
                'accent' => 'Yekan Bakh, Vazirmatn, Tahoma, sans-serif',
            ],
            'typography' => [
                'h1' => $type('2.25rem', '800', '1.2'),
                'h2' => $type('1.875rem', '700', '1.25'),
                'h3' => $type('1.5rem', '700', '1.3'),
                'h4' => $type('1.25rem', '700', '1.35'),
                'h5' => $type('1.125rem', '600', '1.4'),
                'h6' => $type('1rem', '600', '1.45'),
                'body' => $type('0.95rem', '400', '1.75'),
                'small' => $type('0.8rem', '400', '1.5'),
                'link' => $type('0.95rem', '600', '1.5', '#E16BA6'),
            ],
            'buttons' => [
                'radius' => '999px',
                'paddingX' => '1.25rem',
                'paddingY' => '0.625rem',
                'fontSize' => '0.875rem',
                'fontWeight' => '600',
                'variants' => [
                    'primary' => $this->variant('#E16BA6', '#FFFFFF', '#d45b98', '#FFFFFF'),
                    'secondary' => $this->variant('#0C2D63', '#FFFFFF', '#16386f', '#FFFFFF'),
                    'outline' => $this->variant('transparent', '#0C2D63', '#F5F8FB', '#0C2D63', '#E6EEF6'),
                    'ghost' => $this->variant('transparent', '#0C2D63', '#F5F8FB', '#E16BA6', 'transparent'),
                ],
            ],
            'images' => [
                'radius' => '16px',
                'objectFit' => 'cover',
                'lazy' => true,
                'lightbox' => true,
            ],
            'forms' => [
                'radius' => '12px',
                'labelColor' => '#0C2D63',
                'fieldBackground' => '#FFFFFF',
                'borderColor' => '#E6EEF6',
                'focusColor' => '#E16BA6',
                'errorColor' => '#C2414A',
                'padding' => '0.65rem 0.75rem',
            ],
            'layout' => [
                'containerWidth' => '72rem',
                'sectionGap' => '1.5rem',
                'columnGap' => '1rem',
                'background' => '#F5F8FB',
                'contentPadding' => '1rem',
            ],
            'lightbox' => [
                'enabled' => true,
                'background' => 'rgba(16,24,32,0.72)',
            ],
            'cssVariables' => '',
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function normalize(array $input): array
    {
        $base = $this->defaults();
        $colors = is_array($input['colors'] ?? null) ? $input['colors'] : [];
        foreach ($base['colors'] as $key => $fallback) {
            $base['colors'][$key] = $this->color($colors[$key] ?? null, $fallback);
        }

        if (is_array($input['palette'] ?? null)) {
            $palette = [];
            foreach (array_slice($input['palette'], 0, 12) as $index => $swatch) {
                if (! is_array($swatch)) {
                    continue;
                }
                $palette[] = [
                    'id' => $this->token($swatch['id'] ?? ('swatch-'.($index + 1)), 'swatch-'.($index + 1)),
                    'name' => mb_substr(trim((string) ($swatch['name'] ?? 'رنگ')), 0, 40) ?: 'رنگ',
                    'value' => $this->color($swatch['value'] ?? null, '#E16BA6'),
                ];
            }
            if ($palette !== []) {
                $base['palette'] = $palette;
            }
        }

        $fonts = is_array($input['fonts'] ?? null) ? $input['fonts'] : [];
        foreach (['body', 'heading', 'accent'] as $key) {
            $base['fonts'][$key] = $this->font($fonts[$key] ?? null, $base['fonts'][$key]);
        }

        $typography = is_array($input['typography'] ?? null) ? $input['typography'] : [];
        foreach ($base['typography'] as $role => $fallback) {
            $incoming = is_array($typography[$role] ?? null) ? $typography[$role] : [];
            $base['typography'][$role] = [
                'fontSize' => $this->size($incoming['fontSize'] ?? null, $fallback['fontSize']),
                'fontWeight' => $this->weight($incoming['fontWeight'] ?? null, $fallback['fontWeight']),
                'lineHeight' => $this->leading($incoming['lineHeight'] ?? null, $fallback['lineHeight']),
            ];
            if ($role === 'link') {
                $base['typography'][$role]['color'] = $this->color($incoming['color'] ?? null, $fallback['color'] ?? '#E16BA6');
            }
        }

        $buttons = is_array($input['buttons'] ?? null) ? $input['buttons'] : [];
        $base['buttons']['radius'] = $this->size($buttons['radius'] ?? null, $base['buttons']['radius']);
        $base['buttons']['paddingX'] = $this->size($buttons['paddingX'] ?? null, $base['buttons']['paddingX']);
        $base['buttons']['paddingY'] = $this->size($buttons['paddingY'] ?? null, $base['buttons']['paddingY']);
        $base['buttons']['fontSize'] = $this->size($buttons['fontSize'] ?? null, $base['buttons']['fontSize']);
        $base['buttons']['fontWeight'] = $this->weight($buttons['fontWeight'] ?? null, $base['buttons']['fontWeight']);
        $variants = is_array($buttons['variants'] ?? null) ? $buttons['variants'] : [];
        foreach ($base['buttons']['variants'] as $name => $fallback) {
            $incoming = is_array($variants[$name] ?? null) ? $variants[$name] : [];
            $base['buttons']['variants'][$name] = [
                'background' => $this->color($incoming['background'] ?? null, $fallback['background'], true),
                'color' => $this->color($incoming['color'] ?? null, $fallback['color']),
                'hoverBackground' => $this->color($incoming['hoverBackground'] ?? null, $fallback['hoverBackground'], true),
                'hoverColor' => $this->color($incoming['hoverColor'] ?? null, $fallback['hoverColor']),
                'border' => $this->color($incoming['border'] ?? null, $fallback['border'] ?? 'transparent', true),
            ];
        }

        $images = is_array($input['images'] ?? null) ? $input['images'] : [];
        $base['images']['radius'] = $this->size($images['radius'] ?? null, $base['images']['radius']);
        $fit = (string) ($images['objectFit'] ?? '');
        $base['images']['objectFit'] = in_array($fit, ['cover', 'contain'], true) ? $fit : $base['images']['objectFit'];
        $base['images']['lazy'] = $this->bool($images['lazy'] ?? null, (bool) $base['images']['lazy']);
        $base['images']['lightbox'] = $this->bool($images['lightbox'] ?? null, (bool) $base['images']['lightbox']);

        $forms = is_array($input['forms'] ?? null) ? $input['forms'] : [];
        $base['forms']['radius'] = $this->size($forms['radius'] ?? null, $base['forms']['radius']);
        foreach (['labelColor', 'fieldBackground', 'borderColor', 'focusColor', 'errorColor'] as $key) {
            $base['forms'][$key] = $this->color($forms[$key] ?? null, $base['forms'][$key]);
        }
        $base['forms']['padding'] = $this->padding($forms['padding'] ?? null, $base['forms']['padding']);

        $layout = is_array($input['layout'] ?? null) ? $input['layout'] : [];
        foreach (['containerWidth', 'sectionGap', 'columnGap', 'contentPadding'] as $key) {
            $base['layout'][$key] = $this->size($layout[$key] ?? null, $base['layout'][$key]);
        }
        $base['layout']['background'] = $this->color($layout['background'] ?? null, $base['layout']['background']);

        $lightbox = is_array($input['lightbox'] ?? null) ? $input['lightbox'] : [];
        $base['lightbox']['enabled'] = $this->bool($lightbox['enabled'] ?? null, (bool) $base['lightbox']['enabled']);
        $base['lightbox']['background'] = $this->color($lightbox['background'] ?? null, $base['lightbox']['background'], true);

        $base['cssVariables'] = $this->variables($input['cssVariables'] ?? '');

        return $base;
    }

    /** @return array{background: string, color: string, hoverBackground: string, hoverColor: string, border: string} */
    private function variant(string $bg, string $fg, string $hoverBg, string $hoverFg, string $border = 'transparent'): array
    {
        return [
            'background' => $bg,
            'color' => $fg,
            'hoverBackground' => $hoverBg,
            'hoverColor' => $hoverFg,
            'border' => $border,
        ];
    }

    private function color(mixed $value, string $fallback, bool $allowTransparent = false): string
    {
        $raw = trim((string) $value);
        if ($allowTransparent && $raw === 'transparent') {
            return 'transparent';
        }
        if (preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $raw)) {
            return $raw;
        }
        if (preg_match('/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/', $raw)) {
            return $raw;
        }

        return $fallback;
    }

    private function size(mixed $value, string $fallback): string
    {
        $raw = trim((string) $value);
        if (preg_match('/^\d+(\.\d+)?(px|rem|em|%)$/', $raw)) {
            return $raw;
        }

        return $fallback;
    }

    private function weight(mixed $value, string $fallback): string
    {
        $raw = trim((string) $value);

        return in_array($raw, ['400', '500', '600', '700', '800'], true) ? $raw : $fallback;
    }

    private function leading(mixed $value, string $fallback): string
    {
        $raw = trim((string) $value);
        if (preg_match('/^\d+(\.\d+)?$/', $raw) || preg_match('/^\d+(\.\d+)?(px|rem|em)$/', $raw)) {
            return $raw;
        }

        return $fallback;
    }

    private function font(mixed $value, string $fallback): string
    {
        $raw = trim((string) $value);
        if ($raw === '' || strlen($raw) > 120) {
            return $fallback;
        }
        if (! preg_match('/^[A-Za-z0-9 ,._\'"-]+$/', $raw)) {
            return $fallback;
        }
        if (preg_match('/url\(|expression|@import/i', $raw)) {
            return $fallback;
        }

        return $raw;
    }

    private function padding(mixed $value, string $fallback): string
    {
        $raw = trim((string) $value);
        if (preg_match('/^(\d+(\.\d+)?(px|rem|em))(\s+\d+(\.\d+)?(px|rem|em)){0,3}$/', $raw)) {
            return $raw;
        }

        return $fallback;
    }

    private function bool(mixed $value, bool $fallback): bool
    {
        if ($value === null || $value === '') {
            return $fallback;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private function token(mixed $value, string $fallback): string
    {
        $raw = strtolower(trim((string) $value));
        if (preg_match('/^[a-z0-9-]{1,32}$/', $raw)) {
            return $raw;
        }

        return $fallback;
    }

    private function variables(mixed $value): string
    {
        $lines = preg_split("/\r\n|\n|\r/", (string) $value) ?: [];
        $kept = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            if (preg_match('/url\(|expression|@import|[{}<>]/i', $line)) {
                continue;
            }
            if (preg_match('/^(--[a-z0-9-]{1,40})\s*:\s*([^;]{1,80});?$/i', $line, $match)) {
                $kept[] = $match[1].': '.trim($match[2]).';';
            }
            if (count($kept) >= 40) {
                break;
            }
        }

        return implode("\n", $kept);
    }
}
