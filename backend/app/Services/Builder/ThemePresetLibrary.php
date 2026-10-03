<?php

namespace App\Services\Builder;

class ThemePresetLibrary
{
    /**
     * @return list<array<string, mixed>>
     */
    public function presets(): array
    {
        return [
            $this->preset('ishop-header', 'header', 'هدر آی‌شاپ', 'منوی صورتی و سرمه‌ای فروشگاه', $this->header('ویبینو')),
            $this->preset('ishop-footer', 'footer', 'فوتر آی‌شاپ', 'پاورقی تماس و معرفی گالری', $this->footer('ویبینو')),
            $this->preset('beauty-header', 'header', 'هدر بیوتی‌شاپ', 'نوار پیشنهاد و منوی مراقبت پوست', $this->beautyHeader()),
            $this->preset('beauty-footer', 'footer', 'فوتر بیوتی‌شاپ', 'پاورقی آرام با لحن گالری زیبایی', $this->footer('بیوتی‌شاپ', 'بیوتی‌شاپ ویترین مراقبت پوست و آرایش است؛ انتخاب کوتاه و توضیح روشن.')),
            $this->preset('ishop-single-post', 'single_post', 'پست تکی آی‌شاپ', 'عنوان، خلاصه و متن نوشته', $this->stack('sec_post', [
                $this->widget('w_post_title', 'heading', ['text' => '{{title}}', 'tag' => 'h1']),
                $this->widget('w_post_excerpt', 'text', ['text' => '{{excerpt}}']),
                $this->widget('w_post_body', 'text', ['text' => '{{body}}']),
            ])),
            $this->preset('ishop-single-page', 'single_page', 'برگه تکی آی‌شاپ', 'چیدمان ساده برای برگه‌های سایت', $this->stack('sec_page', [
                $this->widget('w_page_title', 'heading', ['text' => '{{title}}', 'tag' => 'h1']),
                $this->widget('w_page_body', 'text', ['text' => '{{body}}']),
            ])),
            $this->preset('ishop-single-product', 'single_product', 'محصول تکی آی‌شاپ', 'جزئیات محصول و پیشنهادهای همراه', $this->doc([
                $this->section('sec_pdp', [$this->widget('w_pdp', 'product-detail', [])]),
                $this->section('sec_related', [$this->widget('w_related', 'product-grid', ['title' => 'پیشنهادهای همراه', 'limit' => 4, 'source' => 'related'])]),
            ])),
            $this->preset('ishop-archive', 'archive', 'بایگانی مجله', 'سربرگ مجله و تازه‌های نوشته', $this->stack('sec_archive', [
                $this->widget('w_archive_title', 'heading', ['text' => 'مجله ویبینو', 'tag' => 'h1']),
                $this->widget('w_archive_text', 'text', ['text' => 'یادداشت‌های مراقبت و آرایش، کوتاه و قابل‌پیگیری.']),
                $this->widget('w_archive_blog', 'blog-teasers', ['title' => 'تازه‌های مجله']),
            ])),
            $this->preset('ishop-search', 'search', 'نتایج جستجو', 'عنوان جستجو برای فروشگاه', $this->stack('sec_search', [
                $this->widget('w_search_title', 'heading', ['text' => 'نتایج جستجو', 'tag' => 'h1']),
                $this->widget('w_search_text', 'text', ['text' => 'عبارت را در نام محصول یا نوشته پیدا کنید.']),
                $this->widget('w_search_grid', 'product-grid', ['title' => 'محصولات نزدیک', 'limit' => 6, 'source' => 'all', 'showSort' => true]),
            ])),
            $this->preset('ishop-product-archive', 'product_archive', 'آرشیو محصولات', 'فیلتر و شبکه فروشگاه آی‌شاپ', $this->doc([
                $this->section('sec_shop_head', [
                    $this->widget('w_shop_title', 'heading', ['text' => 'فروشگاه ویبینو', 'tag' => 'h1']),
                    $this->widget('w_shop_cats', 'category-grid', ['title' => 'خرید بر اساس دسته', 'variant' => 'strip']),
                ]),
                $this->columns('sec_shop_grid', [
                    [3, [$this->widget('w_filters', 'filter-panel', [])]],
                    [9, [$this->widget('w_grid', 'product-grid', ['title' => 'همه محصولات', 'limit' => 9, 'source' => 'all', 'showSort' => true])]],
                ]),
            ])),
            $this->preset('ishop-loop', 'loop_item', 'کارت محصول آی‌شاپ', 'کارت آماده برای شبکه‌ها', $this->stack('sec_loop', [
                $this->widget('w_loop_card', 'product-card', []),
            ])),
            $this->preset('beauty-loop', 'loop_item', 'کارت بیوتی', 'نام، برند و قیمت با دکمه صورتی', $this->stack('sec_beauty_loop', [
                $this->widget('w_loop_name', 'heading', ['text' => '{{name}}', 'tag' => 'h3']),
                $this->widget('w_loop_meta', 'text', ['text' => '{{brand}} — {{price}}']),
                $this->widget('w_loop_btn', 'button', ['label' => 'مشاهده', 'href' => '{{href}}', 'tone' => 'pink']),
            ])),
            $this->preset('ishop-404', 'not_found', 'صفحه ۴۰۴ آی‌شاپ', 'بازگشت آرام به خانه', $this->stack('sec_404', [
                $this->widget('w_404_title', 'heading', ['text' => 'این صفحه پیدا نشد', 'tag' => 'h1']),
                $this->widget('w_404_text', 'text', ['text' => 'نشانی را دوباره بررسی کنید یا به فروشگاه ویبینو برگردید.']),
                $this->widget('w_404_btn', 'button', ['label' => 'بازگشت به خانه', 'href' => '/', 'tone' => 'pink']),
            ])),
            $this->preset('beauty-404', 'not_found', 'صفحه ۴۰۴ بیوتی', 'پیام کوتاه گالری زیبایی', $this->stack('sec_beauty_404', [
                $this->widget('w_b404_title', 'heading', ['text' => 'این قفسه خالی است', 'tag' => 'h1']),
                $this->widget('w_b404_text', 'text', ['text' => 'محصول را از ویترین بیوتی‌شاپ دوباره انتخاب کنید.']),
                $this->widget('w_b404_btn', 'button', ['label' => 'رفتن به فروشگاه', 'href' => '/shop', 'tone' => 'navy']),
            ])),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function kits(): array
    {
        return [
            [
                'id' => 'ishop-kit',
                'title' => 'بسته آی‌شاپ',
                'blurb' => 'هدر، فوتر، تکی‌ها، بایگانی، جستجو، آرشیو محصول، کارت لوپ و ۴۰۴',
                'includes' => [
                    'ishop-header', 'ishop-footer', 'ishop-single-post', 'ishop-single-page',
                    'ishop-single-product', 'ishop-archive', 'ishop-search', 'ishop-product-archive',
                    'ishop-loop', 'ishop-404',
                ],
            ],
            [
                'id' => 'beauty-kit',
                'title' => 'بسته بیوتی‌شاپ',
                'blurb' => 'هدر و فوتر گالری زیبایی به‌همراه کارت لوپ و صفحه ۴۰۴',
                'includes' => ['beauty-header', 'beauty-footer', 'beauty-loop', 'beauty-404'],
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        foreach ($this->presets() as $preset) {
            if ($preset['id'] === $id) {
                return $preset;
            }
        }
        foreach ($this->kits() as $kit) {
            if ($kit['id'] === $id) {
                return ['id' => $kit['id'], 'kind' => 'kit', 'includes' => $kit['includes'], 'title' => $kit['title']];
            }
        }

        return null;
    }

    /** @param  array<string, mixed>  $document */
    private function preset(string $id, string $kind, string $title, string $blurb, array $document): array
    {
        return [
            'id' => $id,
            'kind' => $kind,
            'title' => $title,
            'blurb' => $blurb,
            'document' => $document,
        ];
    }

    /** @param  list<array<string, mixed>>  $widgets */
    private function stack(string $id, array $widgets): array
    {
        return $this->doc([$this->section($id, $widgets)]);
    }

    /** @param  list<array<string, mixed>>  $sections */
    private function doc(array $sections): array
    {
        return ['version' => 1, 'sections' => $sections, 'source' => 'theme-preset'];
    }

    /** @param  list<array<string, mixed>>  $widgets */
    private function section(string $id, array $widgets, int $span = 12): array
    {
        return [
            'id' => $id,
            'columns' => [[
                'id' => $id.'_col',
                'span' => $span,
                'widgets' => $widgets,
            ]],
        ];
    }

    /**
     * @param  list<array{0: int, 1: list<array<string, mixed>>}>  $columns
     * @return array<string, mixed>
     */
    private function columns(string $id, array $columns): array
    {
        $built = [];
        foreach ($columns as $index => $column) {
            $built[] = [
                'id' => $id.'_col_'.$index,
                'span' => $column[0],
                'mobileSpan' => 12,
                'widgets' => $column[1],
            ];
        }

        return ['id' => $id, 'columns' => $built];
    }

    /** @param  array<string, mixed>  $props */
    private function widget(string $id, string $type, array $props): array
    {
        return ['id' => $id, 'type' => $type, 'props' => $props];
    }

    private function header(string $mark): array
    {
        return $this->stack('sec_header', [
            $this->widget('w_header', 'store-header', [
                'mark' => $mark,
                'links' => "خانه|/\nفروشگاه|/shop\nمجله|/blog\nجستجو|/search",
            ]),
        ]);
    }

    private function beautyHeader(): array
    {
        return $this->doc([
            [
                'id' => 'sec_announce',
                'columns' => [[
                    'id' => 'col_announce',
                    'span' => 12,
                    'widgets' => [
                        $this->widget('w_announce', 'heading', ['text' => 'ارسال آرام برای سفارش‌های مراقبت پوست', 'tag' => 'h3']),
                    ],
                ]],
                'style' => ['base' => ['background' => '#FDE8F2', 'padding' => ['top' => '12px', 'bottom' => '12px'], 'textAlign' => 'center']],
            ],
            $this->section('sec_beauty_header', [
                $this->widget('w_beauty_header', 'store-header', [
                    'mark' => 'بیوتی‌شاپ',
                    'links' => "خانه|/\nویترین|/shop\nمجله|/blog",
                ]),
            ]),
        ]);
    }

    private function footer(string $mark, ?string $about = null): array
    {
        return $this->stack('sec_footer', [
            $this->widget('w_footer', 'store-footer', [
                'phone' => '۰۲۱۹۱۰۹۱۰۹۱',
                'email' => 'hello@webino.shop',
                'about' => $about ?? ($mark.' گالری مراقبت و آرایش است؛ انتخاب کوتاه، توضیح روشن، و فروش روی وبینو.'),
            ]),
        ]);
    }
}
