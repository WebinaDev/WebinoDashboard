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

        $c = $this->catalogColors();
        $hoverPrimary = $this->shade($c['primary'], 0.12);
        $hoverSecondary = $this->shade($c['secondary'], 0.12);

        return [
            'colors' => array_merge($c, [
                'success' => '#1F8A70',
                'danger' => '#C2414A',
            ]),
            'palette' => $this->catalogPalette($c),
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
                'link' => $type('0.95rem', '600', '1.5', $c['accent']),
            ],
            'buttons' => [
                'radius' => '999px',
                'paddingX' => '1.25rem',
                'paddingY' => '0.625rem',
                'fontSize' => '0.875rem',
                'fontWeight' => '600',
                'variants' => [
                    'primary' => $this->variant($c['primary'], '#FFFFFF', $hoverPrimary, '#FFFFFF'),
                    'secondary' => $this->variant($c['secondary'], '#FFFFFF', $hoverSecondary, '#FFFFFF'),
                    'outline' => $this->variant('transparent', $c['secondary'], $c['background'], $c['secondary'], $c['border']),
                    'ghost' => $this->variant('transparent', $c['secondary'], $c['background'], $c['accent'], 'transparent'),
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
                'labelColor' => $c['text'],
                'fieldBackground' => $c['surface'],
                'borderColor' => $c['border'],
                'focusColor' => $c['accent'],
                'errorColor' => '#C2414A',
                'padding' => '0.65rem 0.75rem',
            ],
            'layout' => [
                'containerWidth' => '72rem',
                'sectionGap' => '1.5rem',
                'columnGap' => '1rem',
                'background' => $c['background'],
                'contentPadding' => '1rem',
            ],
            'lightbox' => [
                'enabled' => true,
                'background' => 'rgba(16,24,32,0.72)',
            ],
            'cssVariables' => '',
            'customFonts' => [],
            'breakpoints' => ['tablet' => 1024, 'mobile' => 767],
            'variables' => [],
            'classes' => [],
            'presets' => [],
            'components' => [],
            'customCode' => [],
            'queries' => [],
            'dashboardTheme' => ['followAccent' => false, 'accentColor' => '#0F8A8F'],
        ];
    }


    /**
     * Apply tenant brand / appearance when the request is scoped to a site.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function normalizeForTenant(array $input, int $tenantId): array
    {
        $tenant = \App\Models\Tenant::query()->find($tenantId);
        $branding = is_array($tenant?->branding) ? $tenant->branding : [];
        $palette = is_array($branding['palette'] ?? null) ? $branding['palette'] : [];
        $appearance = [];
        try {
            $appearance = app(\App\Services\Shop\StorefrontAppearanceService::class)->publicPayload($tenantId);
        } catch (\Throwable) {
            $appearance = [];
        }

        return $this->normalize($input, $palette, $appearance);
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>|null  $brandPalette
     * @param  array<string, mixed>|null  $appearance
     * @return array<string, mixed>
     */
    public function normalize(array $input, ?array $brandPalette = null, ?array $appearance = null): array
    {
        $stock = $this->defaults();
        $base = $stock;
        $catalog = $this->catalogColors();
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
                    'value' => $this->color($swatch['value'] ?? null, $catalog['primary']),
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
                $base['typography'][$role]['color'] = $this->color($incoming['color'] ?? null, $fallback['color'] ?? $catalog['accent']);
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

        $dash = is_array($input['dashboardTheme'] ?? null) ? $input['dashboardTheme'] : [];
        $base['dashboardTheme']['followAccent'] = $this->bool($dash['followAccent'] ?? null, false);
        $base['dashboardTheme']['accentColor'] = $this->color($dash['accentColor'] ?? null, $base['dashboardTheme']['accentColor']);

        $base['cssVariables'] = $this->variables($input['cssVariables'] ?? '');

        $fontsIn = is_array($input['customFonts'] ?? null) ? array_slice($input['customFonts'], 0, 24) : [];
        foreach ($fontsIn as $font) {
            if (! is_array($font)) {
                continue;
            }
            $family = trim(preg_replace('/[^\p{L}\p{N} _-]/u', '', (string) ($font['family'] ?? '')) ?? '');
            $url = trim((string) ($font['url'] ?? ''));
            $okUrl = (str_starts_with($url, 'https://') || (str_starts_with($url, '/') && ! str_starts_with($url, '//')))
                && preg_match('/^[^\s"\'()<>\\\\]+$/', $url) && strlen($url) <= 500;
            if ($family === '' || ! $okUrl) {
                continue;
            }
            $weight = preg_match('/^\d{3}( \d{3})?$/', (string) ($font['weight'] ?? '')) ? (string) $font['weight'] : '400';
            $base['customFonts'][] = [
                'family' => mb_substr($family, 0, 60),
                'url' => $url,
                'weight' => $weight,
                'style' => ($font['style'] ?? '') === 'italic' ? 'italic' : 'normal',
            ];
        }

        $bp = is_array($input['breakpoints'] ?? null) ? $input['breakpoints'] : [];
        $tablet = max(600, min(1600, (int) ($bp['tablet'] ?? 1024) ?: 1024));
        $mobile = max(320, min($tablet - 1, (int) ($bp['mobile'] ?? 767) ?: 767));
        $base['breakpoints'] = ['tablet' => $tablet, 'mobile' => $mobile];

        $this->designSystem($input, $base);

        if ($this->colorsAreUnsetOrSeed(is_array($input['colors'] ?? null) ? $input['colors'] : [])) {
            $base = $this->paintWithBrand(
                $base,
                $brandPalette,
                $appearance,
                $stock,
                is_array($input['palette'] ?? null) ? $input['palette'] : null,
            );
        }

        return $base;
    }

    /** Design variables, global classes, presets, components and custom code (phase 6). */
    private function designSystem(array $input, array &$base): void
    {
        $id = fn ($v) => is_string($v) && preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $v) ? $v : null;
        $name = fn ($v, int $max = 80) => mb_substr(trim(strip_tags((string) $v)), 0, $max);
        $style = function ($v): array {
            if (! is_array($v)) {
                return [];
            }
            $json = json_encode($v);

            return $json !== false && strlen($json) <= 20000 ? array_intersect_key($v, array_flip(['base', 'tablet', 'mobile'])) : [];
        };

        $seen = [];
        foreach (array_slice((array) ($input['variables'] ?? []), 0, 200) as $v) {
            if (! is_array($v) || ! ($vid = $id($v['id'] ?? null)) || isset($seen[$vid])) {
                continue;
            }
            $value = trim((string) ($v['value'] ?? ''));
            if ($value === '' || strlen($value) > 120 || preg_match('/[{}<>;]|url\(|expression|@import|javascript:/i', $value)) {
                continue;
            }
            $seen[$vid] = true;
            $base['variables'][] = ['id' => $vid, 'name' => $name($v['name'] ?? $vid) ?: $vid, 'kind' => in_array($v['kind'] ?? '', ['color', 'size', 'font', 'other'], true) ? $v['kind'] : 'other', 'value' => $value];
        }

        $seen = [];
        foreach (array_slice((array) ($input['classes'] ?? []), 0, 300) as $c) {
            if (! is_array($c) || ! ($cid = $id($c['id'] ?? null)) || isset($seen[$cid])) {
                continue;
            }
            $seen[$cid] = true;
            $base['classes'][] = ['id' => $cid, 'name' => $name($c['name'] ?? $cid) ?: $cid, 'style' => $style($c['style'] ?? null)];
        }

        $seen = [];
        foreach (array_slice((array) ($input['presets'] ?? []), 0, 300) as $p) {
            if (! is_array($p) || ! ($pid = $id($p['id'] ?? null)) || isset($seen[$pid]) || ! preg_match('/^[a-z0-9-]{1,40}$/', (string) ($p['widget'] ?? ''))) {
                continue;
            }
            $seen[$pid] = true;
            $props = [];
            foreach ((array) ($p['props'] ?? []) as $k => $val) {
                if (is_string($k) && strlen($k) <= 60 && (is_scalar($val) || $val === null)) {
                    $props[$k] = is_string($val) ? mb_substr($val, 0, 5000) : $val;
                }
            }
            $base['presets'][] = ['id' => $pid, 'name' => $name($p['name'] ?? $pid) ?: $pid, 'widget' => $p['widget'], 'style' => $style($p['style'] ?? null), 'props' => (object) $props];
        }

        $seen = [];
        foreach (array_slice((array) ($input['components'] ?? []), 0, 100) as $c) {
            if (! is_array($c) || ! ($cid = $id($c['id'] ?? null)) || isset($seen[$cid]) || ! is_array($c['sections'] ?? null)) {
                continue;
            }
            $json = json_encode($c);
            if ($json === false || strlen($json) > 300000) {
                continue;
            }
            $seen[$cid] = true;
            $props = [];
            foreach (array_slice((array) ($c['props'] ?? []), 0, 40) as $prop) {
                if (is_array($prop) && preg_match('/^[\w-]{1,60}$/', (string) ($prop['key'] ?? '')) && is_string($prop['widget'] ?? null) && is_string($prop['prop'] ?? null)) {
                    $props[] = ['key' => $prop['key'], 'label' => $name($prop['label'] ?? $prop['key']) ?: $prop['key'], 'widget' => mb_substr($prop['widget'], 0, 80), 'prop' => mb_substr($prop['prop'], 0, 60)];
                }
            }
            $variants = [];
            foreach (array_slice((array) ($c['variants'] ?? []), 0, 12) as $variant) {
                if (is_array($variant) && ($vid = $id($variant['id'] ?? null)) && is_array($variant['sections'] ?? null)) {
                    $variants[] = ['id' => $vid, 'name' => $name($variant['name'] ?? $vid, 60) ?: $vid, 'sections' => array_values($variant['sections'])];
                }
            }
            $base['components'][] = ['id' => $cid, 'name' => $name($c['name'] ?? $cid) ?: $cid, 'sections' => array_values($c['sections']), 'props' => $props, 'variants' => $variants];
        }

        $seen = [];
        foreach (array_slice((array) ($input['customCode'] ?? []), 0, 30) as $c) {
            if (! is_array($c) || ! ($cid = $id($c['id'] ?? null)) || isset($seen[$cid]) || ! is_string($c['code'] ?? null)) {
                continue;
            }
            $seen[$cid] = true;
            $lines = preg_split('/\r\n|\n|\r/', (string) ($c['paths'] ?? '')) ?: [];
            $paths = array_values(array_filter(array_map(fn ($line) => preg_match('#^/[\w\-/.%]*\*?$#u', trim($line)) ? trim($line) : null, $lines)));
            $base['customCode'][] = [
                'id' => $cid,
                'name' => $name($c['name'] ?? $cid) ?: $cid,
                'location' => ($c['location'] ?? '') === 'head' ? 'head' : 'body_end',
                'code' => mb_substr($c['code'], 0, 20000),
                'enabled' => ! empty($c['enabled']),
                'paths' => implode("\n", array_slice($paths, 0, 30)),
            ];
        }

        // Global queries (Query Builder): saved Loop Grid queries referenced by `queryId`.
        $seen = [];
        $slug = fn ($v) => mb_substr(preg_replace('/[^\p{L}\p{N}_\-,| ]/u', '', (string) $v), 0, 200);
        foreach (array_slice((array) ($input['queries'] ?? []), 0, 50) as $q) {
            if (! is_array($q) || ! ($qid = $id($q['id'] ?? null)) || isset($seen[$qid])) {
                continue;
            }
            $seen[$qid] = true;
            $source = in_array($q['source'] ?? '', ['products', 'posts', 'collection'], true) ? $q['source'] : 'products';
            $filters = [];
            foreach (array_slice((array) ($q['filters'] ?? []), 0, 8) as $f) {
                if (is_array($f) && preg_match('/^[a-z][a-z0-9_]{0,39}$/', (string) ($f['key'] ?? '')) && is_scalar($f['value'] ?? null) && (string) $f['value'] !== '') {
                    $filters[] = ['key' => (string) $f['key'], 'value' => mb_substr(strip_tags((string) $f['value']), 0, 200)];
                }
            }
            $base['queries'][] = [
                'id' => $qid,
                'name' => $name($q['name'] ?? $qid) ?: $qid,
                'source' => $source,
                'collection' => $slug($q['collection'] ?? ''),
                'category' => $slug($q['category'] ?? ''),
                'brand' => $slug($q['brand'] ?? ''),
                'search' => $name($q['search'] ?? '', 80),
                'filters' => $filters,
                'sort' => in_array($q['sort'] ?? '', ['newest', 'oldest', 'title', 'price', 'price_desc', 'popular', 'best_selling', 'sort'], true) ? $q['sort'] : 'newest',
                'limit' => max(1, min(48, (int) ($q['limit'] ?? 8))),
                'offset' => max(0, min(48, (int) ($q['offset'] ?? 0))),
                'onSale' => ! empty($q['onSale']),
                'inStock' => ! empty($q['inStock']),
                'exclude' => $slug($q['exclude'] ?? ''),
            ];
        }
    }



    /** @return array<string, string> */
    public function catalogColors(): array
    {
        $palette = \App\Kernel\ThemeCatalog::defaultPalette();

        return [
            'primary' => $palette['primary'],
            'secondary' => $palette['secondary'],
            'text' => $palette['text'],
            'accent' => $palette['accent'],
            'background' => $palette['bg'],
            'surface' => $palette['surface'],
            'border' => $palette['border'],
            'muted' => $palette['muted'],
        ];
    }

    /**
     * Historical blush seed shipped by earlier builder defaults. Used only to detect untouched values.
     *
     * @var array<string, string>
     */
    public const SEED_COLORS = [
        'primary' => '#E16BA6',
        'secondary' => '#0C2D63',
        'text' => '#0C2D63',
        'accent' => '#E16BA6',
        'background' => '#F5F8FB',
        'surface' => '#FFFFFF',
        'border' => '#E6EEF6',
        'muted' => '#5C6B82',
    ];

    /**
     * @param  array<string, string>  $colors
     * @return list<array{id: string, name: string, value: string}>
     */
    public function catalogPalette(array $colors): array
    {
        return [
            ['id' => 'primary', 'name' => 'اصلی', 'value' => $colors['primary']],
            ['id' => 'secondary', 'name' => 'ثانویه', 'value' => $colors['secondary']],
            ['id' => 'background', 'name' => 'پس‌زمینه', 'value' => $colors['background']],
            ['id' => 'text', 'name' => 'متن', 'value' => $colors['text']],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $palette
     * @param  array<string, mixed>|null  $appearance
     * @return array<string, string>
     */
    public function resolveBrandColors(?array $palette, ?array $appearance = null): array
    {
        $defaults = $this->catalogColors();
        $p = is_array($palette) ? $palette : [];
        $a = is_array($appearance) ? $appearance : [];
        $pick = function (array $keys, string $fallback) use ($p, $a): string {
            foreach ($keys as $key) {
                $hex = $this->canonicalHex($p[$key] ?? null) ?? $this->canonicalHex($a[$key] ?? null);
                if ($hex !== null) {
                    return $hex;
                }
            }

            return $fallback;
        };

        return [
            'primary' => $pick(['primary', 'primary_color'], $defaults['primary']),
            'secondary' => $pick(['secondary', 'secondary_color', 'navy', 'navy_color', 'ink'], $defaults['secondary']),
            'text' => $pick(['text', 'text1_color', 'foreground', 'ink'], $defaults['text']),
            'accent' => $pick(['accent', 'accent_color'], $defaults['accent']),
            'background' => $pick(['bg', 'background', 'paper'], $defaults['background']),
            'surface' => $pick(['surface', 'surface_color', 'paper'], $defaults['surface']),
            'border' => $pick(['border', 'border_color'], $defaults['border']),
            'muted' => $pick(['muted', 'text2_color'], $defaults['muted']),
        ];
    }

    /** @param  array<string, mixed>  $colors */
    public function colorsAreUnsetOrSeed(array $colors): bool
    {
        foreach (array_keys(self::SEED_COLORS) as $key) {
            $raw = trim((string) ($colors[$key] ?? ''));
            if ($raw === '') {
                continue;
            }
            if (! $this->hexEqual($raw, self::SEED_COLORS[$key])) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>|null  $palette
     * @param  array<string, mixed>|null  $appearance
     * @param  array<string, mixed>  $stock
     * @param  array<int, mixed>|null  $incomingPalette
     * @return array<string, mixed>
     */
    private function paintWithBrand(array $base, ?array $palette, ?array $appearance, array $stock, ?array $incomingPalette): array
    {
        $resolved = $this->resolveBrandColors($palette, $appearance);
        foreach ($resolved as $key => $value) {
            $base['colors'][$key] = $value;
        }

        $replacePalette = $incomingPalette === null || $incomingPalette === []
            || $this->paletteIsSeed($incomingPalette)
            || $this->paletteMatches($base['palette'] ?? [], $stock['palette'] ?? []);
        if ($replacePalette) {
            $base['palette'] = $this->catalogPalette($resolved);
        }

        $c = $base['colors'];
        $hoverP = $this->shade($c['primary'], 0.12);
        $hoverS = $this->shade($c['secondary'], 0.12);

        if ($this->isStockOrSeedColor((string) ($base['typography']['link']['color'] ?? ''), (string) ($stock['typography']['link']['color'] ?? ''))) {
            $base['typography']['link']['color'] = $c['accent'];
        }

        $desired = [
            'primary' => $this->variant($c['primary'], '#FFFFFF', $hoverP, '#FFFFFF'),
            'secondary' => $this->variant($c['secondary'], '#FFFFFF', $hoverS, '#FFFFFF'),
            'outline' => $this->variant('transparent', $c['secondary'], $c['background'], $c['secondary'], $c['border']),
            'ghost' => $this->variant('transparent', $c['secondary'], $c['background'], $c['accent'], 'transparent'),
        ];
        foreach ($desired as $name => $variant) {
            foreach ($variant as $field => $value) {
                $current = (string) ($base['buttons']['variants'][$name][$field] ?? '');
                $stockVal = (string) ($stock['buttons']['variants'][$name][$field] ?? '');
                if ($this->isStockOrSeedColor($current, $stockVal)) {
                    $base['buttons']['variants'][$name][$field] = $value;
                }
            }
        }

        $formMap = [
            'labelColor' => $c['text'],
            'fieldBackground' => $c['surface'],
            'borderColor' => $c['border'],
            'focusColor' => $c['accent'],
        ];
        foreach ($formMap as $key => $value) {
            if ($this->isStockOrSeedColor((string) ($base['forms'][$key] ?? ''), (string) ($stock['forms'][$key] ?? ''))) {
                $base['forms'][$key] = $value;
            }
        }

        if ($this->isStockOrSeedColor((string) ($base['layout']['background'] ?? ''), (string) ($stock['layout']['background'] ?? ''))) {
            $base['layout']['background'] = $c['background'];
        }

        return $base;
    }

    /** @param  array<int, mixed>  $palette */
    private function paletteIsSeed(array $palette): bool
    {
        if ($palette === []) {
            return true;
        }
        $hasBlushId = false;
        foreach ($palette as $swatch) {
            if (! is_array($swatch)) {
                continue;
            }
            $id = strtolower((string) ($swatch['id'] ?? ''));
            if ($id === 'blush') {
                $hasBlushId = true;
            }
            $value = (string) ($swatch['value'] ?? '');
            if ($value !== '' && ! $this->isSeedHex($value) && ! $this->hexEqual($value, '#101820')) {
                return false;
            }
        }

        return $hasBlushId;
    }

    /** @param  array<int, mixed>  $a */
    /** @param  array<int, mixed>  $b */
    private function paletteMatches(array $a, array $b): bool
    {
        if (count($a) !== count($b)) {
            return false;
        }
        foreach ($a as $i => $swatch) {
            if (! is_array($swatch) || ! is_array($b[$i] ?? null)) {
                return false;
            }
            if ((string) ($swatch['id'] ?? '') !== (string) ($b[$i]['id'] ?? '')) {
                return false;
            }
            if (! $this->hexEqual($swatch['value'] ?? '', $b[$i]['value'] ?? '')) {
                return false;
            }
        }

        return true;
    }

    private function isStockOrSeedColor(string $current, string $stock): bool
    {
        if ($current === 'transparent' && $stock === 'transparent') {
            return true;
        }

        return $this->hexEqual($current, $stock) || $this->isSeedHex($current);
    }

    private function isSeedHex(string $value): bool
    {
        foreach (array_values(self::SEED_COLORS) as $seed) {
            if ($this->hexEqual($value, $seed)) {
                return true;
            }
        }
        foreach (['#101820', '#d45b98', '#16386f'] as $seed) {
            if ($this->hexEqual($value, $seed)) {
                return true;
            }
        }

        return false;
    }

    private function hexEqual(mixed $a, mixed $b): bool
    {
        $left = $this->canonicalHex($a);
        $right = $this->canonicalHex($b);

        return $left !== null && $left === $right;
    }

    private function canonicalHex(mixed $value): ?string
    {
        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }
        if (! str_starts_with($raw, '#')) {
            if (preg_match('/^[0-9a-fA-F]{3,8}$/', $raw)) {
                $raw = '#'.$raw;
            } else {
                return null;
            }
        }
        if (preg_match('/^#([0-9a-fA-F]{3})$/', $raw, $match)) {
            $s = strtolower($match[1]);

            return '#'.$s[0].$s[0].$s[1].$s[1].$s[2].$s[2];
        }
        if (preg_match('/^#([0-9a-fA-F]{6})$/', $raw, $match)) {
            return '#'.strtolower($match[1]);
        }

        return null;
    }

    public function shade(string $hex, float $factor): string
    {
        $normalized = $this->canonicalHex($hex);
        if ($normalized === null) {
            return $hex;
        }
        $r = max(0, min(255, (int) round(hexdec(substr($normalized, 1, 2)) * (1 - $factor))));
        $g = max(0, min(255, (int) round(hexdec(substr($normalized, 3, 2)) * (1 - $factor))));
        $b = max(0, min(255, (int) round(hexdec(substr($normalized, 5, 2)) * (1 - $factor))));

        return sprintf('#%02x%02x%02x', $r, $g, $b);
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
