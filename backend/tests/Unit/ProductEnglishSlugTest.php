<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\V1\ProductController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class ProductEnglishSlugTest extends TestCase
{
    public function test_sanitize_english_slug_strips_non_ascii(): void
    {
        $controller = new ProductController;
        $m = new ReflectionMethod(ProductController::class, 'sanitizeEnglishSlug');
        $m->setAccessible(true);

        $this->assertSame('hello-world', $m->invoke($controller, 'Hello World!'));
        $this->assertSame('abc-123', $m->invoke($controller, 'Abc 123 فارسی'));
        $this->assertSame('', $m->invoke($controller, 'محصول'));
    }
}
