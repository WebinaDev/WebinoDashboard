<?php

namespace Tests\Unit;

use App\Services\Builder\BuilderGlobalsNormalizer;
use Tests\TestCase;

class BuilderGlobalsNormalizerTest extends TestCase
{
    public function test_defaults_are_catalog_not_blush(): void
    {
        $colors = (new BuilderGlobalsNormalizer)->defaults()['colors'];
        $this->assertSame('#e775ae', $colors['primary']);
        $this->assertSame('#021959', $colors['secondary']);
        $this->assertNotEquals('#e16ba6', strtolower($colors['accent']));
    }

    public function test_empty_and_seed_input_derive_from_brand(): void
    {
        $n = new BuilderGlobalsNormalizer;
        $palette = [
            'primary' => '#1B6BC4',
            'secondary' => '#0D3D7A',
            'accent' => '#5BA8E8',
            'bg' => '#EEF4FB',
            'surface' => '#FFFFFF',
            'text' => '#0D2B4A',
            'muted' => '#5A7390',
            'border' => '#D7E6F7',
        ];

        $empty = $n->normalize([], $palette);
        $this->assertSame('#1b6bc4', $empty['colors']['primary']);
        $this->assertSame('#5ba8e8', $empty['colors']['accent']);
        $this->assertSame('#5ba8e8', $empty['forms']['focusColor']);
        $this->assertSame('#eef4fb', $empty['layout']['background']);
        $this->assertSame('primary', $empty['palette'][0]['id']);

        $seed = $n->normalize(['colors' => BuilderGlobalsNormalizer::SEED_COLORS], $palette);
        $this->assertSame('#1b6bc4', $seed['colors']['primary']);
        $this->assertSame('#0d3d7a', $seed['colors']['secondary']);
    }

    public function test_partial_custom_colors_are_kept(): void
    {
        $n = new BuilderGlobalsNormalizer;
        $out = $n->normalize(['colors' => ['primary' => '#112233']], [
            'primary' => '#1B6BC4',
            'secondary' => '#0D3D7A',
        ]);
        $this->assertSame('#112233', $out['colors']['primary']);
        $this->assertSame('#021959', $out['colors']['secondary']);
        $this->assertSame('#dc5f9d', $out['colors']['accent']);
    }

    public function test_appearance_fills_gaps(): void
    {
        $n = new BuilderGlobalsNormalizer;
        $out = $n->normalize([], [], [
            'primary_color' => '#1A8AAA',
            'accent_color' => '#2BB0C7',
            'secondary_color' => '#0B1F33',
        ]);
        $this->assertSame('#1a8aaa', $out['colors']['primary']);
        $this->assertSame('#2bb0c7', $out['colors']['accent']);
        $this->assertSame('#0b1f33', $out['colors']['secondary']);
    }

    public function test_short_hex_seed_is_detected(): void
    {
        $n = new BuilderGlobalsNormalizer;
        $this->assertTrue($n->colorsAreUnsetOrSeed([]));
        $this->assertTrue($n->colorsAreUnsetOrSeed(['primary' => '#e16ba6', 'accent' => '#E16BA6']));
        $this->assertFalse($n->colorsAreUnsetOrSeed(['primary' => '#112233']));
    }
}
