<?php

namespace App\Services\Provision;

use App\Models\AcademyCourse;
use App\Models\BlogPost;
use App\Models\CmsPage;
use App\Models\PortfolioItem;
use App\Models\TeamMember;
use App\Models\Tenant;
use App\Models\Testimonial;

class ProvisionContentSeeder
{
    /**
     * @param  array<string, mixed>  $seed
     */
    public function seed(Tenant $tenant, array $seed): void
    {
        if (($seed['business_category_slug'] ?? $tenant->business_category_slug) === 'corporate') {
            $seed = array_merge($this->defaultCorporateSeed(), $seed);
        }

        $pages = $seed['default_pages'] ?? [
            ['slug' => 'about', 'title' => 'About us', 'body' => 'About our company.'],
            ['slug' => 'services', 'title' => 'Services', 'body' => 'What we offer.'],
            ['slug' => 'privacy', 'title' => 'Privacy', 'body' => 'Privacy policy.'],
        ];

        if (is_array($pages)) {
            foreach ($pages as $page) {
                if (! is_array($page) || empty($page['slug'])) {
                    continue;
                }
                CmsPage::query()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'slug' => (string) $page['slug']],
                    [
                        'title' => (string) ($page['title'] ?? $page['slug']),
                        'body' => (string) ($page['body'] ?? ''),
                        'published' => (bool) ($page['published'] ?? true),
                    ]
                );
            }
        }

        $blog = $seed['sample_blog_post'] ?? null;
        if (is_array($blog)) {
            BlogPost::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => (string) ($blog['slug'] ?? 'welcome')],
                [
                    'title' => (string) ($blog['title'] ?? 'Welcome'),
                    'excerpt' => $blog['excerpt'] ?? null,
                    'body' => $blog['body'] ?? null,
                    'status' => 'published',
                    'published_at' => now(),
                ]
            );
        }

        $portfolio = $seed['sample_portfolio_item'] ?? null;
        if (is_array($portfolio)) {
            PortfolioItem::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => (string) ($portfolio['slug'] ?? 'sample')],
                [
                    'title' => (string) ($portfolio['title'] ?? 'Sample'),
                    'description' => $portfolio['description'] ?? null,
                    'client' => $portfolio['client'] ?? null,
                    'published' => true,
                    'published_at' => now(),
                ]
            );
        }

        $member = $seed['sample_team_member'] ?? null;
        if (is_array($member)) {
            TeamMember::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => (string) ($member['name'] ?? 'Team Lead')],
                [
                    'role' => $member['role'] ?? null,
                    'bio' => $member['bio'] ?? null,
                    'published' => true,
                ]
            );
        }

        $testimonial = $seed['sample_testimonial'] ?? null;
        if (is_array($testimonial)) {
            Testimonial::query()->firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'author' => (string) ($testimonial['author'] ?? 'Client'),
                ],
                [
                    'quote' => (string) ($testimonial['quote'] ?? 'Great work.'),
                    'company' => $testimonial['company'] ?? null,
                    'published' => true,
                ]
            );
        }

        $course = $seed['sample_academy_course'] ?? null;
        if (is_array($course)) {
            AcademyCourse::query()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'slug' => (string) ($course['slug'] ?? 'intro')],
                [
                    'title' => (string) ($course['title'] ?? 'Introduction'),
                    'description' => $course['description'] ?? null,
                    'published' => true,
                ]
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function defaultCorporateSeed(): array
    {
        return [
            'active_theme_slug' => 'corporate-demo-v1',
            'sample_blog_post' => [
                'slug' => 'welcome',
                'title' => 'Welcome',
                'excerpt' => 'Our first post.',
                'body' => 'Corporate site demo content.',
            ],
            'sample_portfolio_item' => [
                'slug' => 'sample-project',
                'title' => 'Sample project',
                'description' => 'Portfolio showcase.',
                'client' => 'Demo Client',
            ],
            'sample_team_member' => [
                'name' => 'Alex Admin',
                'role' => 'CEO',
                'bio' => 'Lead consultant.',
            ],
            'sample_testimonial' => [
                'author' => 'Jane Doe',
                'company' => 'Acme Co',
                'quote' => 'Excellent service.',
            ],
            'sample_academy_course' => [
                'slug' => 'intro',
                'title' => 'Introduction',
                'description' => 'Getting started course.',
            ],
        ];
    }
}
