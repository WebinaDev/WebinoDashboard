<?php

namespace Tests\Unit;

use App\Services\Builder\ThemeRequestContext;
use App\Services\Builder\ThemeTemplateResolver;
use Tests\TestCase;

class ThemeTemplateResolverTest extends TestCase
{
    public function test_conditions_and_default_selection(): void
    {
        $resolver = new ThemeTemplateResolver;
        $shop = new ThemeRequestContext('/shop', null, 'product');
        $home = new ThemeRequestContext('/');
        $cart = new ThemeRequestContext('/cart');
        $product = new ThemeRequestContext('/product/serum', 'product');
        $search = new ThemeRequestContext('/search', null, null, true);

        $this->assertTrue($resolver->matches([
            'include' => [['type' => 'archive', 'value' => 'product']],
        ], $shop));
        $this->assertFalse($resolver->matches([
            'include' => [['type' => 'url', 'value' => '/cart']],
        ], $shop));
        $this->assertFalse($resolver->matches([
            'include' => [['type' => 'entire_site']],
            'exclude' => [['type' => 'url_prefix', 'value' => '/shop']],
        ], $shop));
        $this->assertFalse($resolver->matches(null, $shop));
        $this->assertFalse($resolver->matches(['include' => []], $shop));
        $this->assertTrue($resolver->matches([
            'include' => [['type' => 'singular', 'value' => 'product']],
        ], $product));
        $this->assertTrue($resolver->matches([
            'include' => [['type' => 'search']],
        ], $search));

        $rows = [
            ['id' => 1, 'is_default' => true, 'priority' => 0, 'conditions' => null, 'published' => ['id' => 'default']],
            ['id' => 2, 'is_default' => false, 'priority' => 30, 'conditions' => ['include' => [['type' => 'url', 'value' => '/shop']]], 'published' => ['id' => 'shop']],
            ['id' => 3, 'is_default' => false, 'priority' => 1, 'conditions' => null, 'published' => ['id' => 'bare']],
            ['id' => 4, 'is_default' => false, 'priority' => 20, 'conditions' => ['include' => [['type' => 'url_prefix', 'value' => '/shop']]], 'published' => false],
            ['id' => 5, 'is_default' => false, 'priority' => 9, 'conditions' => [
                'include' => [['type' => 'entire_site']],
                'exclude' => [['type' => 'url', 'value' => '/cart']],
            ], 'published' => ['id' => 'site']],
        ];

        $this->assertSame('shop', $resolver->pick($rows, $shop)['published']['id']);
        $this->assertSame('site', $resolver->pick($rows, $home)['published']['id']);
        $this->assertSame('default', $resolver->pick($rows, $cart)['published']['id']);

        $tied = [
            ['id' => 1, 'is_default' => true, 'priority' => 0, 'conditions' => null, 'published' => ['id' => 'default']],
            ['id' => 8, 'is_default' => false, 'priority' => 4, 'conditions' => ['include' => [['type' => 'url', 'value' => '/']]], 'published' => ['id' => 'older']],
            ['id' => 9, 'is_default' => false, 'priority' => 4, 'conditions' => ['include' => [['type' => 'url', 'value' => '/']]], 'published' => ['id' => 'newer']],
        ];
        $this->assertSame('newer', $resolver->pick($tied, $home)['published']['id']);
    }
}
