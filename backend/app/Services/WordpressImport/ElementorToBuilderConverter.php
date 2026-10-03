<?php

namespace App\Services\WordpressImport;

/**
 * Turns Elementor `_elementor_data` into a Webino builder document
 * (version 1 sections / columns / widgets) the visual builder can open.
 *
 * Widgets without a native block become HTML widgets. A page is never
 * returned with an empty section list when Elementor data or fallback HTML exists.
 */
final class ElementorToBuilderConverter
{
    /** @var list<string> */
    public const MAPPED = [
        'heading', 'animated-headline', 'text-editor', 'text', 'html', 'theme-post-content',
        'image', 'theme-post-featured-image', 'site-logo', 'image-box', 'button', 'call-to-action',
        'gallery', 'image-gallery', 'image-carousel', 'media-carousel', 'video', 'spacer',
        'menu-anchor', 'divider', 'icon-list', 'icon', 'icon-box', 'social-icons', 'form',
        'wpforms', 'shortcode', 'accordion', 'nested-accordion', 'tabs', 'nested-tabs', 'toggle',
        'alert', 'testimonial', 'star-rating', 'nav-menu', 'navigation-menu',
        'woocommerce-products', 'wc-products', 'products', 'archive-products', 'wc-archive-products',
        'woocommerce-product', 'product', 'posts',
    ];

    /**
     * @param  array<string, mixed>  $record
     * @return array{document: array<string, mixed>, unmapped: array<string, int>}|null
     */
    public function convertRecord(array $record): ?array
    {
        $extracted = $this->extract($record);
        if ($extracted === null) {
            return null;
        }

        return $this->convert($extracted['elements'], $extracted['css'], $extracted['page_settings'], (string) ($record['content'] ?? $record['body'] ?? $record['html'] ?? ''));
    }

    /**
     * A plugin-built builder document (version 1 sections) wins over post_content
     * and over a second Elementor conversion. Returns null when no document was sent.
     *
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>|null
     */
    public function preferDocument(array $record): ?array
    {
        $given = $record['document'] ?? $record['builder'] ?? null;
        if (! is_array($given) || ! is_array($given['sections'] ?? null)) {
            return null;
        }
        if (! isset($given['version'])) {
            $given['version'] = 1;
        }
        if (! isset($given['css']) || ! is_string($given['css']) || trim($given['css']) === '') {
            $css = $record['css'] ?? $record['_elementor_css'] ?? null;
            if (! is_string($css) && is_array($record['elementor'] ?? null)) {
                $css = $record['elementor']['css'] ?? null;
            }
            if (is_string($css) && trim($css) !== '') {
                $given['css'] = $this->rewriteCss($css);
            }
        } elseif (is_string($given['css'])) {
            $given['css'] = $this->rewriteCss($given['css']);
        }
        $encoded = json_encode($given);

        return $encoded !== false && strlen($encoded) <= 750000 ? $given : null;
    }

    /**
     * @param  list<mixed>  $elements
     * @param  array<string, mixed>  $pageSettings
     * @return array{document: array<string, mixed>, unmapped: array<string, int>}
     */
    public function convert(array $elements, string $css = '', array $pageSettings = [], string $fallbackHtml = ''): array
    {
        $unmapped = [];
        $sections = [];
        foreach ($elements as $element) {
            if (! is_array($element)) {
                continue;
            }
            foreach ($this->sectionsFrom($element, $unmapped) as $section) {
                $sections[] = $section;
            }
        }
        if (! $this->hasWidget($sections)) {
            $html = trim($fallbackHtml) !== '' ? $fallbackHtml : '<div class="webino-unmapped" data-widget="elementor">محتوای المنتور خالی بود و به‌صورت یک بلوک HTML نگه داشته شد.</div>';
            $sections = [$this->sectionWith($this->htmlWidget('fallback', $html, null))];
        }

        $css = $this->rewriteCss($css."\n".$this->stringSetting($pageSettings, 'custom_css'));
        $document = [
            'version' => 1,
            'source' => 'elementor',
            'sections' => $sections,
        ];
        if ($css !== '') {
            $document['css'] = $css;
        }
        $safeSettings = $this->publicSettings($pageSettings);
        if ($safeSettings !== []) {
            $document['page_settings'] = $safeSettings;
        }
        $encoded = json_encode($document);
        if ($encoded !== false && strlen($encoded) > 700000) {
            unset($document['css'], $document['page_settings']);
        }

        return ['document' => $document, 'unmapped' => $unmapped];
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array{elements: list<array<string, mixed>>, css: string, page_settings: array<string, mixed>}|null
     */
    public function extract(array $record): ?array
    {
        $block = is_array($record['elementor'] ?? null) ? $record['elementor'] : [];
        $data = $record['_elementor_data']
            ?? $record['elementor_data']
            ?? ($block['data'] ?? $block['_elementor_data'] ?? $block['elements'] ?? null);
        $elements = $this->decodeElements($data);
        if ($elements === []) {
            return null;
        }
        $css = (string) ($record['_elementor_css'] ?? $record['elementor_css'] ?? $block['css'] ?? $block['_elementor_css'] ?? '');
        $settings = $record['_elementor_page_settings']
            ?? $record['elementor_page_settings']
            ?? ($block['page_settings'] ?? $block['_elementor_page_settings'] ?? []);

        return [
            'elements' => $elements,
            'css' => $css,
            'page_settings' => is_array($settings) ? $settings : [],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function decodeElements(mixed $data): array
    {
        if (is_string($data)) {
            $data = trim($data);
            if ($data === '') {
                return [];
            }
            $decoded = json_decode($data, true);
            if (! is_array($decoded)) {
                return [];
            }
            $data = $decoded;
        }
        if (! is_array($data)) {
            return [];
        }
        if (array_is_list($data)) {
            return array_values(array_filter($data, 'is_array'));
        }
        foreach (['content', 'elements', 'data', '_elementor_data'] as $key) {
            if (isset($data[$key])) {
                return $this->decodeElements($data[$key]);
            }
        }
        if (isset($data['elType'])) {
            return [$data];
        }

        return [];
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, int>  $unmapped
     * @return list<array<string, mixed>>
     */
    private function sectionsFrom(array $element, array &$unmapped): array
    {
        $type = (string) ($element['elType'] ?? '');
        if ($type === 'section' || ($type === 'container' && $this->hasColumnChildren($element))) {
            return [$this->makeSection($element, $unmapped)];
        }
        if ($type === 'column' || $type === 'container') {
            return [$this->sectionShell($element, [$this->makeColumn($element, 12, $unmapped)])];
        }

        return [$this->sectionWith($this->widgetsFrom($element, $unmapped))];
    }

    /**
     * @param  array<string, mixed>  $element
     */
    private function hasColumnChildren(array $element): bool
    {
        foreach (is_array($element['elements'] ?? null) ? $element['elements'] : [] as $child) {
            if (! is_array($child)) {
                continue;
            }
            $type = (string) ($child['elType'] ?? '');
            if ($type === 'column' || $type === 'section' || $type === 'container') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, int>  $unmapped
     * @return array<string, mixed>
     */
    private function makeSection(array $element, array &$unmapped): array
    {
        $children = array_values(array_filter(
            is_array($element['elements'] ?? null) ? $element['elements'] : [],
            'is_array'
        ));
        $columns = [];
        $loose = [];
        foreach ($children as $child) {
            $type = (string) ($child['elType'] ?? '');
            if ($type === 'column' || $type === 'container' || $type === 'section') {
                if ($loose !== []) {
                    $columns[] = $this->columnShell('loose-'.count($columns), 12, $loose);
                    $loose = [];
                }
                if ($type === 'section' || ($type === 'container' && $this->hasColumnChildren($child))) {
                    $columns[] = $this->columnShell((string) ($child['id'] ?? 'inner'), 12, [
                        $this->containerWidget($child, $unmapped),
                    ]);
                } else {
                    $columns[] = $this->makeColumn($child, 0, $unmapped);
                }
            } else {
                array_push($loose, ...$this->widgetsFrom($child, $unmapped));
            }
        }
        if ($loose !== []) {
            $columns[] = $this->columnShell('loose-'.count($columns), 12, $loose);
        }
        if ($columns === []) {
            $columns[] = $this->columnShell((string) ($element['id'] ?? 'empty'), 12, []);
        }
        $known = 0;
        $missing = 0;
        foreach ($columns as $column) {
            if (($column['span'] ?? 0) > 0) {
                $known += (int) $column['span'];
            } else {
                $missing++;
            }
        }
        if ($missing > 0) {
            $share = max(1, (int) floor((12 - min(11, $known)) / $missing));
            foreach ($columns as $index => $column) {
                if (($column['span'] ?? 0) <= 0) {
                    $columns[$index]['span'] = $share;
                }
            }
        }
        $used = array_sum(array_map(fn (array $column): int => (int) $column['span'], $columns));
        if ($used > 12 && count($columns) > 0) {
            $each = max(1, (int) floor(12 / count($columns)));
            foreach ($columns as $index => $column) {
                $columns[$index]['span'] = $each;
            }
        }

        return $this->sectionShell($element, $columns);
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  list<array<string, mixed>>  $columns
     * @return array<string, mixed>
     */
    private function sectionShell(array $element, array $columns): array
    {
        $section = [
            'id' => $this->nodeId($element, 'sec'),
            'columns' => $columns,
        ];
        $style = $this->style($element);
        if ($style !== []) {
            $section['style'] = $style;
        }
        $settings = is_array($element['settings'] ?? null) ? $element['settings'] : [];
        if (($settings['layout'] ?? '') === 'full_width' || ($settings['content_width'] ?? '') === 'full') {
            $section['fullWidth'] = true;
        }

        return $section;
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, int>  $unmapped
     * @return array<string, mixed>
     */
    private function makeColumn(array $element, int $span, array &$unmapped): array
    {
        if ($span <= 0) {
            $span = $this->span($element);
        }
        $widgets = [];
        foreach (is_array($element['elements'] ?? null) ? $element['elements'] : [] as $child) {
            if (! is_array($child)) {
                continue;
            }
            $type = (string) ($child['elType'] ?? '');
            if ($type === 'section' || $type === 'container' || $type === 'column') {
                $widgets[] = $this->containerWidget($child, $unmapped);
            } else {
                array_push($widgets, ...$this->widgetsFrom($child, $unmapped));
            }
        }

        return $this->columnShell((string) ($element['id'] ?? 'col'), $span, $widgets, $this->style($element));
    }

    /**
     * @param  list<array<string, mixed>>  $widgets
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function columnShell(string $id, int $span, array $widgets, array $style = []): array
    {
        $column = [
            'id' => 'el_'.$this->safe($id !== '' ? $id : 'col'),
            'span' => max(1, min(12, $span)),
            'mobileSpan' => 12,
            'widgets' => $widgets,
        ];
        if ($style !== []) {
            $column['style'] = $style;
        }

        return $column;
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, int>  $unmapped
     * @return array<string, mixed>
     */
    private function containerWidget(array $element, array &$unmapped): array
    {
        $inner = $this->sectionsFrom($element, $unmapped);

        return [
            'id' => $this->nodeId($element, 'w'),
            'type' => 'container',
            'props' => ['label' => 'Elementor'],
            'children' => $inner,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $widgets
     * @return array<string, mixed>
     */
    private function sectionWith(array $widgets): array
    {
        return [
            'id' => 'el_sec_'.$this->safe((string) ($widgets[0]['id'] ?? 'html')),
            'columns' => [$this->columnShell('full', 12, $widgets)],
        ];
    }

    /**
     * @param  array<string, mixed>  $element
     * @param  array<string, int>  $unmapped
     * @return list<array<string, mixed>>
     */
    private function widgetsFrom(array $element, array &$unmapped): array
    {
        $type = strtolower(str_replace('_', '-', (string) ($element['widgetType'] ?? $element['elType'] ?? 'widget')));
        $settings = is_array($element['settings'] ?? null) ? $element['settings'] : [];
        $id = $this->nodeId($element, 'w');
        $style = $this->style($element);
        $widgets = match ($type) {
            'heading', 'animated-headline' => [$this->styled($id, 'heading', [
                'text' => $this->plain($this->first($settings, ['title', 'text', 'heading']) ?: $type),
                'tag' => $this->tag((string) ($settings['header_size'] ?? $settings['tag'] ?? 'h2')),
            ], $style)],
            'text-editor', 'text' => [$this->textOrHtml($id, (string) ($settings['editor'] ?? $settings['text'] ?? ''), $style)],
            'html', 'theme-post-content' => [$this->htmlWidget($id, $this->first($settings, ['html', 'editor', 'rendered']) ?: '<div data-widget="html"></div>', null, $style)],
            'shortcode' => [$this->htmlWidget($id, $this->first($settings, ['rendered', 'html', 'editor']) ?: '<pre>'.e((string) ($settings['shortcode'] ?? '')).'</pre>', $type, $style)],
            'image', 'theme-post-featured-image', 'site-logo', 'image-box' => [$this->imageWidget($id, $settings, $style)],
            'button' => [$this->buttonWidget($id, $settings, $style)],
            'call-to-action' => array_values(array_filter([
                $this->plain($this->first($settings, ['title', 'heading'])) !== ''
                    ? $this->styled($id.'_t', 'heading', ['text' => $this->plain($this->first($settings, ['title', 'heading'])), 'tag' => 'h2'], $style)
                    : null,
                $this->plain($this->first($settings, ['description', 'content'])) !== ''
                    ? $this->textOrHtml($id.'_d', (string) $this->first($settings, ['description', 'content']), [])
                    : null,
                $this->buttonWidget($id, $settings, []),
            ])),
            'gallery', 'image-gallery', 'image-carousel', 'media-carousel' => $this->galleryWidgets($id, $settings, $style),
            'video' => [$this->styled($id, 'video', [
                'src' => $this->first($settings, ['youtube_url', 'vimeo_url', 'hosted_url', 'url', 'link']),
            ], $style)],
            'spacer', 'menu-anchor' => [$this->styled($id, 'spacer', [
                'size' => $this->size($settings['space'] ?? $settings['space_size'] ?? $settings['gap'] ?? 32),
            ], $style)],
            'divider' => [$this->styled($id, 'divider', [
                'color' => $this->color((string) ($settings['color'] ?? $settings['divider_color'] ?? '')) ?? '#e6eef6',
            ], $style)],
            'icon-list' => $this->iconList($id, $settings, $style),
            'icon', 'icon-box' => $this->iconBox($id, $settings, $style),
            'social-icons' => [$this->htmlWidget($id, $this->socialHtml($settings), $type, $style)],
            'form', 'wpforms' => [$this->styled($id, 'form', [
                'title' => $this->plain($this->first($settings, ['form_name', 'title', 'form_title']) ?: 'فرم'),
                'submit' => $this->plain($this->first($settings, ['button_text', 'submit_text']) ?: 'ارسال'),
            ], $style)],
            'accordion', 'nested-accordion', 'tabs', 'nested-tabs', 'toggle', 'alert', 'testimonial', 'star-rating' => [
                $this->htmlWidget($id, $this->structuredHtml($type, $settings), $type, $style),
            ],
            'nav-menu', 'navigation-menu' => [$this->styled($id, 'menu', [
                'links' => $this->menuLinks($settings),
            ], $style)],
            'woocommerce-products', 'wc-products', 'products', 'archive-products', 'wc-archive-products', 'posts' => [
                $this->productGrid($id, $settings, $type, $style),
            ],
            'woocommerce-product', 'product' => [$this->productCard($id, $settings, $style)],
            default => [$this->unmappedWidget($id, $type, $settings, $unmapped, $style)],
        };

        return $widgets === [] ? [$this->unmappedWidget($id, $type, $settings, $unmapped, $style)] : $widgets;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, int>  $unmapped
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function unmappedWidget(string $id, string $type, array $settings, array &$unmapped, array $style): array
    {
        $unmapped[$type] = ($unmapped[$type] ?? 0) + 1;
        $rendered = $this->first($settings, ['rendered', 'html', 'editor', 'content', 'description', 'title', 'text', 'shortcode']);
        $html = trim($rendered) !== ''
            ? $rendered
            : '<div class="webino-unmapped" data-widget="'.e($type).'">'.e($type !== '' ? $type : 'widget').'</div>';

        return $this->htmlWidget($id, $html, $type, $style);
    }

    /**
     * @param  array<string, mixed>  $props
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function styled(string $id, string $type, array $props, array $style): array
    {
        $widget = ['id' => $id, 'type' => $type, 'props' => $props];
        if ($style !== []) {
            $widget['style'] = $style;
        }

        return $widget;
    }

    /**
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function htmlWidget(string $id, string $html, ?string $source, array $style = []): array
    {
        $html = trim($html);
        if ($html === '') {
            $html = '<div class="webino-unmapped" data-widget="'.e((string) $source).'"></div>';
        }
        $props = ['html' => mb_substr($html, 0, 200000)];
        if ($source) {
            $props['elementor_widget'] = $source;
        }

        return $this->styled(str_starts_with($id, 'el_') ? $id : 'el_'.$this->safe($id), 'html', $props, $style);
    }

    /**
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function textOrHtml(string $id, string $value, array $style): array
    {
        if (str_contains($value, '<')) {
            return $this->htmlWidget($id, $value, 'text-editor', $style);
        }

        return $this->styled($id, 'text', ['text' => $this->plain($value !== '' ? $value : ' ')], $style);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function imageWidget(string $id, array $settings, array $style): array
    {
        $image = is_array($settings['image'] ?? null) ? $settings['image'] : [];
        $src = (string) ($image['url'] ?? $settings['image_url'] ?? $settings['url'] ?? '');
        $alt = (string) ($image['alt'] ?? $settings['alt'] ?? $settings['caption'] ?? '');

        return $this->styled($id, 'image', ['src' => $src, 'alt' => $this->plain($alt)], $style);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function buttonWidget(string $id, array $settings, array $style): array
    {
        $link = $settings['link'] ?? $settings['button_link'] ?? '';
        $href = is_array($link) ? (string) ($link['url'] ?? '') : (string) $link;

        return $this->styled($id, 'button', [
            'label' => $this->plain($this->first($settings, ['text', 'button_text', 'title']) ?: 'مشاهده'),
            'href' => $href,
            'tone' => 'pink',
        ], $style);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return list<array<string, mixed>>
     */
    private function galleryWidgets(string $id, array $settings, array $style): array
    {
        $images = is_array($settings['gallery'] ?? null) ? $settings['gallery'] : (is_array($settings['carousel'] ?? null) ? $settings['carousel'] : []);
        $widgets = [];
        foreach ($images as $index => $image) {
            if (is_string($image)) {
                $image = ['url' => $image];
            }
            if (! is_array($image)) {
                continue;
            }
            $src = (string) ($image['url'] ?? '');
            if ($src === '') {
                continue;
            }
            $widgets[] = $this->styled($id.'_'.$index, 'image', [
                'src' => $src,
                'alt' => $this->plain((string) ($image['alt'] ?? '')),
            ], $index === 0 ? $style : []);
        }
        if ($widgets === []) {
            $rendered = $this->first($settings, ['rendered', 'html']);

            return [$this->htmlWidget($id, $rendered !== '' ? $rendered : '<div class="webino-unmapped" data-widget="gallery">گالری</div>', 'gallery', $style)];
        }

        return $widgets;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return list<array<string, mixed>>
     */
    private function iconList(string $id, array $settings, array $style): array
    {
        $items = is_array($settings['icon_list'] ?? null) ? $settings['icon_list'] : [];
        $widgets = [];
        foreach ($items as $index => $item) {
            if (! is_array($item)) {
                continue;
            }
            $widgets[] = $this->styled($id.'_'.$index, 'icon', [
                'name' => $this->iconName($item),
                'label' => $this->plain((string) ($item['text'] ?? $item['title'] ?? '')),
            ], $index === 0 ? $style : []);
        }
        if ($widgets === []) {
            return [$this->htmlWidget($id, '<div class="webino-unmapped" data-widget="icon-list">icon-list</div>', 'icon-list', $style)];
        }

        return $widgets;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return list<array<string, mixed>>
     */
    private function iconBox(string $id, array $settings, array $style): array
    {
        $widgets = [$this->styled($id, 'icon', [
            'name' => $this->iconName($settings),
            'label' => $this->plain($this->first($settings, ['title_text', 'title', 'text']) ?: 'ویژگی'),
        ], $style)];
        $body = $this->first($settings, ['description_text', 'description', 'editor']);
        if ($body !== '') {
            $widgets[] = $this->textOrHtml($id.'_d', $body, []);
        }

        return $widgets;
    }

    /** @param  array<string, mixed>  $item */
    private function iconName(array $item): string
    {
        $icon = $item['selected_icon'] ?? $item['icon'] ?? '';
        $value = is_array($icon) ? (string) ($icon['value'] ?? '') : (string) $icon;
        $value = strtolower($value);
        foreach (['truck' => 'truck', 'shield' => 'shield', 'heart' => 'heart', 'star' => 'star'] as $needle => $name) {
            if (str_contains($value, $needle)) {
                return $name;
            }
        }

        return 'spark';
    }

    /** @param  array<string, mixed>  $settings */
    private function socialHtml(array $settings): string
    {
        $items = is_array($settings['social_icon_list'] ?? null) ? $settings['social_icon_list'] : [];
        $links = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $url = is_array($item['link'] ?? null) ? (string) ($item['link']['url'] ?? '') : (string) ($item['link'] ?? '');
            $label = $this->plain((string) ($item['social'] ?? $item['title'] ?? 'link'));
            if ($url !== '') {
                $links[] = '<a href="'.e($url).'">'.e($label).'</a>';
            }
        }
        $html = $links === [] ? '<div class="webino-unmapped" data-widget="social-icons">social-icons</div>' : '<p>'.implode(' ', $links).'</p>';

        return $html;
    }

    /** @param  array<string, mixed>  $settings */
    private function structuredHtml(string $type, array $settings): string
    {
        $rendered = $this->first($settings, ['rendered', 'html', 'editor']);
        if ($rendered !== '') {
            return $rendered;
        }
        $chunks = [];
        foreach (['tabs', 'items', 'accordion', 'testimonials'] as $key) {
            if (! is_array($settings[$key] ?? null)) {
                continue;
            }
            foreach ($settings[$key] as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $title = $this->plain((string) ($item['tab_title'] ?? $item['title'] ?? $item['accordion_title'] ?? ''));
                $body = (string) ($item['tab_content'] ?? $item['content'] ?? $item['accordion_content'] ?? $item['testimonial_content'] ?? '');
                if ($title !== '') {
                    $chunks[] = '<h3>'.e($title).'</h3>';
                }
                if (trim($body) !== '') {
                    $chunks[] = $body;
                }
            }
        }
        $title = $this->plain($this->first($settings, ['alert_title', 'title', 'testimonial_name']));
        $body = $this->first($settings, ['alert_description', 'testimonial_content', 'content', 'description']);
        if ($title !== '') {
            array_unshift($chunks, '<h3>'.e($title).'</h3>');
        }
        if ($body !== '') {
            $chunks[] = $body;
        }
        if ($chunks === []) {
            return '<div class="webino-unmapped" data-widget="'.e($type).'">'.e($type).'</div>';
        }

        return implode("\n", $chunks);
    }

    /** @param  array<string, mixed>  $settings */
    private function menuLinks(array $settings): string
    {
        $items = is_array($settings['menu_items'] ?? null) ? $settings['menu_items'] : [];
        $lines = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $label = trim((string) ($item['title'] ?? $item['label'] ?? ''));
            $url = trim((string) ($item['url'] ?? $item['href'] ?? ''));
            if ($label !== '' && $url !== '') {
                $lines[] = $label.'|'.$url;
            }
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function productGrid(string $id, array $settings, string $type, array $style): array
    {
        if ($type === 'posts' && ! in_array((string) ($settings['posts_post_type'] ?? $settings['post_type'] ?? 'post'), ['product', 'products'], true)) {
            return $this->htmlWidget($id, $this->first($settings, ['rendered', 'html']) ?: '<div class="webino-unmapped" data-widget="posts">posts</div>', 'posts', $style);
        }
        $columns = max(1, (int) ($settings['columns'] ?? 4));
        $rows = max(1, (int) ($settings['rows'] ?? 1));
        $limit = min(12, $columns * $rows);
        $source = match ((string) ($settings['query_source'] ?? $settings['source'] ?? 'new')) {
            'featured', 'sale' => 'featured',
            'related' => 'related',
            'all', 'current_query' => 'all',
            default => 'new',
        };

        return $this->styled($id, 'product-grid', [
            'title' => $this->plain($this->first($settings, ['title', 'section_title']) ?: 'محصولات'),
            'limit' => $limit,
            'source' => $source,
            'showSort' => false,
        ], $style);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $style
     * @return array<string, mixed>
     */
    private function productCard(string $id, array $settings, array $style): array
    {
        $slug = trim((string) ($settings['product_slug'] ?? $settings['slug'] ?? ''));
        if ($slug !== '') {
            return $this->styled($id, 'product-card', ['slug' => $slug], $style);
        }
        $label = $this->plain($this->first($settings, ['product_title', 'title']) ?: 'محصول');
        $external = trim((string) ($settings['product_id'] ?? ''));

        return $this->htmlWidget(
            $id,
            '<div class="webino-unmapped" data-widget="product" data-product-id="'.e($external).'">'.e($label).'</div>',
            'product',
            $style
        );
    }

    /** @param  array<string, mixed>  $element */
    private function span(array $element): int
    {
        $settings = is_array($element['settings'] ?? null) ? $element['settings'] : [];
        $size = $settings['_column_size'] ?? $settings['width'] ?? $settings['column_size'] ?? null;
        if (is_array($size)) {
            $size = $size['size'] ?? null;
        }
        if (is_numeric($size) && (float) $size > 0) {
            $percent = (float) $size > 12 ? (float) $size : ((float) $size / 12) * 100;

            return max(1, min(12, (int) round($percent / 100 * 12)));
        }

        return 0;
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>
     */
    private function style(array $element): array
    {
        $settings = is_array($element['settings'] ?? null) ? $element['settings'] : [];
        $base = array_filter([
            'color' => $this->color((string) ($settings['title_color'] ?? $settings['text_color'] ?? $settings['color'] ?? '')),
            'background' => $this->color((string) ($settings['background_color'] ?? '')),
            'fontSize' => $this->fontSize($settings['typography_font_size'] ?? $settings['title_typography_font_size'] ?? null),
            'fontWeight' => $this->fontWeight($settings['typography_font_weight'] ?? null),
            'textAlign' => $this->align((string) ($settings['align'] ?? $settings['title_align'] ?? $settings['text_align'] ?? '')),
            'padding' => $this->box($settings['padding'] ?? null),
            'margin' => $this->box($settings['margin'] ?? null),
            'radius' => $this->radius($settings['border_radius'] ?? null),
            'minHeight' => $this->fontSize($settings['min_height'] ?? null),
        ], fn ($value) => $value !== null && $value !== []);
        if (! empty($settings['hide_desktop'])) {
            $base['hidden'] = true;
        }
        $style = [];
        if ($base !== []) {
            $style['base'] = $base;
        }
        if (! empty($settings['hide_tablet'])) {
            $style['tablet'] = ['hidden' => true];
        }
        if (! empty($settings['hide_mobile'])) {
            $style['mobile'] = ['hidden' => true];
        }

        return $style;
    }

    private function color(string $value): ?string
    {
        $value = trim($value);
        if (preg_match('/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $value)) {
            return $value;
        }
        if (preg_match('/^rgba?\(\s*[\d.\s%,]+\)$/i', $value)) {
            return $value;
        }

        return null;
    }

    private function box(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }
        $unit = in_array(($value['unit'] ?? 'px'), ['px', 'em', 'rem', '%'], true) ? (string) $value['unit'] : 'px';
        $box = [];
        foreach (['top', 'right', 'bottom', 'left'] as $edge) {
            if (isset($value[$edge]) && $value[$edge] !== '' && is_numeric($value[$edge])) {
                $box[$edge] = $value[$edge].$unit;
            }
        }

        return $box === [] ? null : $box;
    }

    private function fontSize(mixed $value): ?string
    {
        if (is_array($value)) {
            $size = $value['size'] ?? null;
            $unit = in_array(($value['unit'] ?? 'px'), ['px', 'em', 'rem', '%'], true) ? (string) $value['unit'] : 'px';
            if (is_numeric($size)) {
                return $size.$unit;
            }

            return null;
        }
        if (is_numeric($value)) {
            return $value.'px';
        }

        return null;
    }

    private function fontWeight(mixed $value): ?string
    {
        if (is_numeric($value)) {
            return (string) (int) $value;
        }

        return null;
    }

    private function align(string $value): ?string
    {
        return match (strtolower(trim($value))) {
            'left', 'start' => 'start',
            'right', 'end' => 'end',
            'center' => 'center',
            default => null,
        };
    }

    private function radius(mixed $value): ?string
    {
        if (is_array($value)) {
            $size = $value['top'] ?? $value['size'] ?? null;
            $unit = in_array(($value['unit'] ?? 'px'), ['px', '%', 'em'], true) ? (string) $value['unit'] : 'px';
            if (is_numeric($size)) {
                return $size.$unit;
            }
        }
        if (is_numeric($value)) {
            return $value.'px';
        }

        return null;
    }

    private function size(mixed $value): int
    {
        if (is_array($value)) {
            $value = $value['size'] ?? 32;
        }

        return max(4, min(240, (int) $value));
    }

    private function tag(string $tag): string
    {
        $tag = strtolower(trim($tag));

        return in_array($tag, ['h1', 'h2', 'h3'], true) ? $tag : 'h2';
    }

    /** @param  array<string, mixed>  $settings */
    private function first(array $settings, array $keys): string
    {
        foreach ($keys as $key) {
            if (! isset($settings[$key]) || is_array($settings[$key])) {
                continue;
            }
            $text = trim((string) $settings[$key]);
            if ($text !== '') {
                return $text;
            }
        }

        return '';
    }

    /** @param  array<string, mixed>  $settings */
    private function stringSetting(array $settings, string $key): string
    {
        $value = $settings[$key] ?? '';

        return is_string($value) ? $value : '';
    }

    private function plain(string $value): string
    {
        $value = trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));

        return mb_substr($value, 0, 500);
    }

    /** @param  array<string, mixed>  $element */
    private function nodeId(array $element, string $prefix): string
    {
        $raw = (string) ($element['id'] ?? '');

        return 'el_'.$this->safe($raw !== '' ? $raw : $prefix);
    }

    private function safe(string $value): string
    {
        $value = preg_replace('/[^A-Za-z0-9_-]+/', '', $value) ?? '';

        return $value !== '' ? mb_substr($value, 0, 40) : substr(sha1($value), 0, 8);
    }

    /**
     * Rewrite Elementor element selectors onto builder node classes (`wb-el_{id}`).
     */
    private function rewriteCss(string $css): string
    {
        $css = preg_replace('/<\/style/i', '', $css) ?? $css;
        $css = preg_replace('/\.elementor-element-([A-Za-z0-9_-]+)/', '.wb-el_$1', $css) ?? $css;
        $css = trim($css);

        return mb_substr($css, 0, 100000);
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function publicSettings(array $settings): array
    {
        unset($settings['custom_css']);
        $clean = [];
        foreach ($settings as $key => $value) {
            if (! is_string($key) || preg_match('/password|secret|token|api[_-]?key|private/i', $key)) {
                continue;
            }
            if (is_scalar($value) || $value === null) {
                $clean[$key] = $value;
            }
        }

        return $clean;
    }

    /** @param  list<array<string, mixed>>  $sections */
    private function hasWidget(array $sections): bool
    {
        foreach ($sections as $section) {
            foreach ($section['columns'] ?? [] as $column) {
                if (is_array($column) && ($column['widgets'] ?? []) !== []) {
                    return true;
                }
            }
        }

        return false;
    }
}
