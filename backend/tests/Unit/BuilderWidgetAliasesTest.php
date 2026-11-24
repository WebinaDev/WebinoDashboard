<?php

namespace Tests\Unit;

use App\Support\BuilderWidgetAliases;
use PHPUnit\Framework\TestCase;

class BuilderWidgetAliasesTest extends TestCase
{
    public function test_only_widget_types_are_migrated_in_nested_sections(): void
    {
        $doc = [
            'type' => 'checkout-stub',
            'sections' => [[
                'type' => 'account-stub',
                'columns' => [['widgets' => [
                    ['type' => 'checkout-stub', 'props' => ['type' => 'account-stub', 'nested' => ['type' => 'checkout-stub']]],
                    ['type' => 'container', 'props' => [], 'children' => [['columns' => [['widgets' => [
                        ['type' => 'account-stub', 'props' => ['type' => 'checkout-stub']],
                    ]]]]]],
                ]]],
            ]],
        ];

        [$out, $count] = BuilderWidgetAliases::migrate($doc);
        $this->assertSame(2, $count);
        $this->assertSame('checkout-stub', $out['type']);
        $this->assertSame('account-stub', $out['sections'][0]['type']);
        $widgets = $out['sections'][0]['columns'][0]['widgets'];
        $this->assertSame('checkout', $widgets[0]['type']);
        $this->assertSame($doc['sections'][0]['columns'][0]['widgets'][0]['props'], $widgets[0]['props']);
        $this->assertSame('account', $widgets[1]['children'][0]['columns'][0]['widgets'][0]['type']);
        $this->assertSame('checkout-stub', $widgets[1]['children'][0]['columns'][0]['widgets'][0]['props']['type']);
        $this->assertSame([$out, 0], BuilderWidgetAliases::migrate($out));
    }

    public function test_invalid_or_unrelated_data_is_left_unchanged(): void
    {
        foreach ([null, ['type' => 'checkout-stub'], ['sections' => [['columns' => 'invalid']]]] as $value) {
            $this->assertSame([$value, 0], BuilderWidgetAliases::migrate($value));
        }
    }
}
