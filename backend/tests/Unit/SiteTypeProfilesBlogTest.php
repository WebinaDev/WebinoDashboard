<?php

namespace Tests\Unit;

use App\Kernel\SiteTypeProfiles;
use App\Kernel\ThemeCatalog;
use PHPUnit\Framework\TestCase;

class SiteTypeProfilesBlogTest extends TestCase
{
    public function test_blog_site_type_is_registered_with_blog_module(): void
    {
        $this->assertContains('blog', SiteTypeProfiles::TYPES);
        $blog = SiteTypeProfiles::all()['blog'];
        $this->assertSame('وبلاگ', $blog['name_fa']);
        $this->assertSame('magazine-default', $blog['theme']);
        $this->assertSame(['posts', 'categories'], $blog['modules']['blog']);
        $this->assertArrayHasKey('core', $blog['modules']);
    }

    public function test_blog_default_theme_is_in_catalog_for_blog(): void
    {
        $themes = array_values(array_filter(ThemeCatalog::all(), fn (array $t): bool => $t['slug'] === 'magazine-default'));
        $this->assertCount(1, $themes);
        $this->assertContains('blog', $themes[0]['site_types']);
    }
}
