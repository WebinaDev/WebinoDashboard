<?php

namespace Database\Seeders;

use App\Models\AcademyCourse;
use App\Models\Announcement;
use App\Models\BlogPost;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\DashboardModule;
use App\Models\MarketingCampaign;
use App\Models\PortfolioItem;
use App\Models\Product;
use App\Models\TeamMember;
use App\Models\Tenant;
use App\Models\TenantModule;
use App\Models\Testimonial;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $modules = [
            ['slug' => 'dashboard', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'modules', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'catalog', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'cart', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'checkout', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'analytics', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'rbac', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'inventory', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'reports', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'marketing', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'cms', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'blog', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'academy', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'portfolio', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'announcements', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'testimonials', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'team', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'consultations', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'accounting', 'requires_license' => true, 'git_repo' => null],
            ['slug' => 'native_api', 'requires_license' => false, 'git_repo' => null],
            ['slug' => 'ai_recommendations', 'requires_license' => false, 'git_repo' => null],
        ];

        foreach ($modules as $m) {
            DashboardModule::query()->updateOrCreate(
                ['slug' => $m['slug']],
                [
                    'requires_license' => $m['requires_license'],
                    'git_repo' => $m['git_repo'],
                    'default_version' => '0.1.0',
                ]
            );
        }

        $tenant = Tenant::query()->updateOrCreate(
            ['slug' => 'demo'],
            [
                'name' => 'Demo tenant',
                'domain' => 'localhost',
                'license_key' => 'dev-license',
                'setup_completed' => false,
                'store_display_name' => 'Demo Corporate',
                'default_currency' => 'IRR',
                'business_category_slug' => 'corporate',
                'business_type_slug' => 'agency',
                'theme_preset' => 'agency',
                'active_theme_slug' => 'corporate-demo-v1',
                'nav_preset' => ['preset' => 'agency'],
            ]
        );

        User::query()->updateOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Admin',
                'password' => Hash::make('password'),
                'tenant_id' => $tenant->id,
                'role' => 'admin',
            ]
        );

        $enabled = [
            'dashboard', 'catalog', 'cart', 'checkout', 'rbac', 'modules', 'accounting',
            'analytics', 'inventory', 'reports', 'marketing', 'cms', 'native_api', 'ai_recommendations',
            'blog', 'academy', 'portfolio', 'announcements', 'testimonials', 'team', 'consultations',
        ];

        foreach ($modules as $m) {
            $slug = $m['slug'];
            TenantModule::query()->updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'module_slug' => $slug,
                ],
                [
                    'enabled' => in_array($slug, $enabled, true),
                    'licensed' => ! $m['requires_license'],
                    'installed_version' => '0.1.0',
                ]
            );
        }

        $cat = Category::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'general'],
            ['name' => 'General']
        );

        Product::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'sku' => 'SKU-1'],
            [
                'category_id' => $cat->id,
                'name' => 'Demo product',
                'price_minor' => 990000,
                'currency' => 'IRR',
                'stock' => 50,
            ]
        );

        MarketingCampaign::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Welcome campaign'],
            ['status' => 'draft']
        );

        foreach (
            [
                ['slug' => 'about', 'title' => 'About us', 'body' => 'We help businesses grow.'],
                ['slug' => 'privacy', 'title' => 'Privacy', 'body' => 'Privacy policy content.'],
                ['slug' => 'services', 'title' => 'Services', 'body' => 'Our professional services.'],
            ] as $page
        ) {
            CmsPage::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => $page['slug']],
                ['title' => $page['title'], 'body' => $page['body'], 'published' => true]
            );
        }

        BlogPost::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'welcome'],
            [
                'title' => 'Welcome to our site',
                'excerpt' => 'First blog post.',
                'body' => 'This is a demo blog post for the corporate template.',
                'status' => 'published',
                'published_at' => now(),
            ]
        );

        PortfolioItem::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'sample-project'],
            [
                'title' => 'Sample project',
                'description' => 'A showcase portfolio item.',
                'client' => 'Demo Client',
                'published' => true,
                'published_at' => now(),
            ]
        );

        AcademyCourse::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'slug' => 'intro'],
            [
                'title' => 'Introduction course',
                'description' => 'Getting started.',
                'published' => true,
            ]
        );

        Announcement::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'title' => 'Welcome'],
            ['body' => 'Thanks for visiting.', 'published' => true, 'pinned' => true]
        );

        Testimonial::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'author' => 'Jane Doe'],
            [
                'company' => 'Acme Co',
                'quote' => 'Excellent service and support.',
                'published' => true,
            ]
        );

        TeamMember::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Alex Admin'],
            ['role' => 'CEO', 'bio' => 'Founder and lead consultant.', 'published' => true]
        );
    }
}
