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

    public function test_extended_display_conditions(): void
    {
        $r = new ThemeTemplateResolver;
        $m = fn (array $rule, ThemeRequestContext $c) => $r->matches(['include' => [$rule]], $c);
        $brand = ThemeRequestContext::fromArray(['path' => '/brand/sony', 'archive' => 'brand', 'brand' => 'Sony']);
        $post = ThemeRequestContext::fromArray(['path' => '/blog/hello', 'singular' => 'post', 'slug' => 'hello']);
        $tag = ThemeRequestContext::fromArray(['path' => '/tag/news', 'archive' => 'tag', 'tag' => 'news']);

        $this->assertTrue($m(['type' => 'front_page'], new ThemeRequestContext('/')));
        $this->assertFalse($m(['type' => 'front_page'], $post));
        $this->assertTrue($m(['type' => 'brand', 'value' => 'lg, sony'], $brand));
        $this->assertFalse($m(['type' => 'brand', 'value' => 'lg'], $brand));
        $this->assertTrue($m(['type' => 'post', 'value' => 'hello'], $post));
        $this->assertFalse($m(['type' => 'page', 'value' => 'hello'], $post));
        $this->assertTrue($m(['type' => 'tag'], $tag));

        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-10-28 10:00', 'Asia/Tehran'));
        try {
            $this->assertTrue($m(['type' => 'date_range', 'value' => '۱۴۰۵-۰۸-۰۱..۱۴۰۵-۰۸-۳۰'], $post));
            $this->assertTrue($m(['type' => 'date_range', 'value' => '2026-10-01..'], $post));
            $this->assertFalse($m(['type' => 'date_range', 'value' => '1405-09-01..1405-09-30'], $post));
            $this->assertTrue($m(['type' => 'weekday', 'value' => '3'], $post));
            $this->assertTrue($m(['type' => 'time_range', 'value' => '08:00-14:00'], $post));
            $this->assertTrue($m(['type' => 'time_range', 'value' => '22:00-11:00'], $post));
            $this->assertFalse($m(['type' => 'time_range', 'value' => '12:00-14:00'], $post));
        } finally {
            \Illuminate\Support\Carbon::setTestNow();
        }
    }
}
