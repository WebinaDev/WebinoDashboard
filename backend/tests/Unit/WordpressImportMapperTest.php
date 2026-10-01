<?php

namespace Tests\Unit;

use App\Services\WordpressImport\ImportUrlGuard;
use App\Services\WordpressImport\WordpressImportMapper;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class WordpressImportMapperTest extends TestCase
{
    public function test_toman_prices_stay_whole_units_and_rial_multiplier_scales_them(): void
    {
        $mapper = new WordpressImportMapper;

        $this->assertSame(99000, $mapper->toMinor(['sale_price' => '99000'], 'sale_price', 'IRT', 1));
        $this->assertSame(990000, $mapper->toMinor(['price' => '99000'], 'price', 'IRR', 10));
        $this->assertSame(1999, $mapper->toMinor(['price' => '19.99'], 'price', 'USD', 1));
        $this->assertSame(120000, $mapper->toMinor(['price' => '1', 'price_minor' => 120000], 'price', 'IRT', 10));
    }

    public function test_woo_statuses_and_persian_slugs(): void
    {
        $mapper = new WordpressImportMapper;

        $this->assertSame('on_hold', $mapper->orderStatus('on-hold'));
        $this->assertSame('completed', $mapper->orderStatus('completed'));
        $this->assertSame('pending_payment', $mapper->orderStatus('pending'));
        $this->assertSame('رژ-لب', $mapper->slug('رژ لب', 'fallback'));
        $this->assertSame('publish', $mapper->productStatus('publish'));
        $this->assertSame('draft', $mapper->productStatus('private'));
    }

    public function test_navigation_merge_is_additive(): void
    {
        $mapper = new WordpressImportMapper;
        $document = [
            'version' => 1,
            'sections' => [[
                'id' => 'sec',
                'columns' => [[
                    'id' => 'col',
                    'widgets' => [[
                        'id' => 'header',
                        'type' => 'store-header',
                        'props' => ['mark' => 'پریسما', 'links' => "خانه|/\nفروشگاه|/shop"],
                    ]],
                ]],
            ]],
        ];

        $merged = $mapper->mergeNavigation($document, 'header', "فروشگاه|/shop\nمجله|/blog");
        $links = $merged['sections'][0]['columns'][0]['widgets'][0]['props']['links'];

        $this->assertSame('پریسما', $merged['sections'][0]['columns'][0]['widgets'][0]['props']['mark']);
        $this->assertStringContainsString('خانه|/', $links);
        $this->assertStringContainsString('مجله|/blog', $links);
        $this->assertSame(1, substr_count($links, 'فروشگاه|/shop'));
    }

    public function test_source_url_shape_rejects_private_targets_without_resolving_names(): void
    {
        $this->assertSame('https://parisma.ir', ImportUrlGuard::normalizeSource('https://parisma.ir/'));
        $this->assertSame('https://parisma.ir/shop', ImportUrlGuard::normalizeSource('https://parisma.ir/shop?x=1#y'));
        try {
            ImportUrlGuard::normalizeSource('https://user:secret@parisma.ir/shop');
            $this->fail('Credentials must be rejected.');
        } catch (InvalidArgumentException) {
            $this->assertTrue(true);
        }

        foreach ([
            'http://127.0.0.1',
            'http://169.254.169.254/latest',
            'http://localhost/wp-admin',
            'file:///etc/passwd',
            'http://10.0.0.8/products',
            'https://metadata.google.internal/',
            'http://parisma.local',
        ] as $url) {
            try {
                ImportUrlGuard::normalizeSource($url);
                $this->fail('Expected rejection for '.$url);
            } catch (InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
    }
}
