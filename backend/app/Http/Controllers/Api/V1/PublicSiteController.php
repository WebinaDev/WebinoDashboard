<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\BlogPost;
use App\Models\PortfolioItem;
use App\Models\Testimonial;
use Illuminate\Http\Request;

class PublicSiteController extends Controller
{
    use ResolvesPublicTenant;

    public function tenant(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);

        return response()->json([
            'data' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'domain' => $tenant->domain,
                'store_display_name' => $tenant->store_display_name,
                'business_category_slug' => $tenant->business_category_slug,
                'business_type_slug' => $tenant->business_type_slug,
                'theme_preset' => $tenant->theme_preset,
                'active_theme_slug' => $tenant->active_theme_slug,
                'branding' => $tenant->branding,
                'nav_preset' => $tenant->nav_preset,
            ],
        ]);
    }

    public function home(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $tenant = $this->publicTenant($request);

        $blocks = $tenant->home_blocks;
        if (! is_array($blocks) || $blocks === []) {
            $blocks = [
                ['type' => 'hero', 'enabled' => true],
                ['type' => 'services', 'enabled' => true],
                ['type' => 'portfolio_teaser', 'enabled' => true],
                ['type' => 'testimonials', 'enabled' => true],
                ['type' => 'announcements', 'enabled' => true],
                ['type' => 'consultation_cta', 'enabled' => true],
            ];
        }

        return response()->json([
            'data' => [
                'tenant' => [
                    'name' => $tenant->store_display_name ?? $tenant->name,
                    'branding' => $tenant->branding,
                    'active_theme_slug' => $tenant->active_theme_slug ?? 'corporate-demo-v1',
                ],
                'blocks' => $blocks,
                'announcements' => Announcement::query()->where('tenant_id', $tid)->active()
                    ->orderByDesc('pinned')->orderByDesc('id')->limit(5)->get(),
                'testimonials' => Testimonial::query()->where('tenant_id', $tid)->published()->limit(6)->get(),
                'portfolio' => PortfolioItem::query()->where('tenant_id', $tid)->published()
                    ->orderByDesc('published_at')->limit(6)->get(),
                'blog' => BlogPost::query()->where('tenant_id', $tid)->published()
                    ->orderByDesc('published_at')->limit(3)->get(['id', 'slug', 'title', 'excerpt', 'cover_url', 'published_at']),
            ],
        ]);
    }
}
