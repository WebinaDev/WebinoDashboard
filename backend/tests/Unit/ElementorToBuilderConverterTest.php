<?php

namespace Tests\Unit;

use App\Services\WordpressImport\ElementorToBuilderConverter;
use Tests\TestCase;

class ElementorToBuilderConverterTest extends TestCase
{
    public function test_elementor_json_becomes_a_builder_document(): void
    {
        $record = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/wordpress/elementor-home.json'), true);
        $result = (new ElementorToBuilderConverter)->convertRecord($record);

        $this->assertNotNull($result);
        $document = $result['document'];
        $this->assertSame(1, $document['version']);
        $this->assertSame('elementor', $document['source']);
        $this->assertSame(6, $document['sections'][0]['columns'][0]['span']);
        $this->assertSame(6, $document['sections'][0]['columns'][1]['span']);

        $left = $document['sections'][0]['columns'][0]['widgets'];
        $this->assertSame('heading', $left[0]['type']);
        $this->assertSame('پریسما', $left[0]['props']['text']);
        $this->assertSame('h1', $left[0]['props']['tag']);
        $this->assertSame('html', $left[1]['type']);
        $this->assertStringContainsString('متن با تگ', $left[1]['props']['html']);
        $this->assertSame('button', $left[2]['type']);
        $this->assertSame('/shop', $left[2]['props']['href']);
        $this->assertSame('spacer', $left[3]['type']);
        $this->assertSame(40, $left[3]['props']['size']);
        $this->assertSame('divider', $left[4]['type']);
        $this->assertSame('icon', $left[5]['type']);
        $this->assertSame('truck', $left[5]['props']['name']);

        $right = $document['sections'][0]['columns'][1]['widgets'];
        $this->assertSame('image', $right[0]['type']);
        $this->assertSame('image', $right[1]['type']);
        $this->assertSame('video', $right[2]['type']);
        $this->assertSame('product-grid', $right[3]['type']);
        $this->assertSame(8, $right[3]['props']['limit']);
        $this->assertSame('html', $right[4]['type']);
        $this->assertStringContainsString('نقشه', $right[4]['props']['html']);
        $this->assertSame(1, $result['unmapped']['google-maps']);
        $this->assertStringContainsString('.wb-el_h1', $document['css']);
        $this->assertStringNotContainsString('</style', $document['css']);
    }

    public function test_supplied_builder_document_wins_over_elementor_data(): void
    {
        $record = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/wordpress/elementor-home.json'), true);
        $record['document'] = [
            'version' => 1,
            'sections' => [[
                'id' => 'sec_plugin',
                'columns' => [[
                    'id' => 'col_plugin',
                    'span' => 12,
                    'widgets' => [[
                        'id' => 'w_heading',
                        'type' => 'heading',
                        'props' => ['text' => 'از افزونه', 'tag' => 'h2'],
                    ]],
                ]],
            ]],
        ];

        $document = (new ElementorToBuilderConverter)->preferDocument($record);

        $this->assertSame('از افزونه', $document['sections'][0]['columns'][0]['widgets'][0]['props']['text']);
        $this->assertStringContainsString('.wb-el_h1', $document['css']);
    }
}
