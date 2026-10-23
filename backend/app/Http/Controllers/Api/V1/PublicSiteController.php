<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Kernel\ThemeCatalog;
use App\Models\Announcement;
use App\Models\BlogPost;
use App\Models\PortfolioItem;
use App\Models\Testimonial;
use App\Services\Auth\OtpSettings;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Shop\ShopSettings;
use App\Services\Shop\StorefrontAppearanceService;
use Illuminate\Http\Request;

class PublicSiteController extends Controller
{
    use ResolvesPublicTenant;

    public function tenant(Request $request, ModuleSettingsService $settings, StorefrontAppearanceService $appearance): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $branding = ThemeCatalog::normalizeBranding($tenant->branding);
        $branding['appearance'] = $appearance->publicPayload((int) $tenant->id);
        // Brand files uploaded while the site lived on an alias (e.g. bluecafe.webinaagency.ir) are
        // stored as absolute URLs. Serve them same-origin so the primary domain does not depend on
        // (or preload from) another host.
        $ownHosts = array_filter(array_map('strtolower', array_merge([(string) $tenant->domain], $tenant->normalizedDomainAliases())));
        foreach (['logo_url', 'logo_dark_url', 'favicon_url'] as $key) {
            $url = $branding[$key] ?? null;
            if (is_string($url) && preg_match('#^https?://([^/:]+)(?::\d+)?(/.*)?$#i', $url, $m) && in_array(strtolower($m[1]), $ownHosts, true)) {
                $branding[$key] = ($m[2] ?? '') !== '' ? $m[2] : '/';
            }
        }
        $otp = OtpSettings::forTenant((int) $tenant->id, $settings);
        $privacy = $settings->get((int) $tenant->id, 'settings', 'site.privacy', [
            'guest_checkout' => false,
            'account_creation' => true,
        ]);
        $shopGeneral = ShopSettings::getGeneral((int) $tenant->id);
        $guestCheckout = ! empty($privacy['guest_checkout']) || ! empty($shopGeneral['guest_checkout']);

        return response()->json([
            'data' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'domain' => $tenant->domain,
                'domain_aliases' => $tenant->normalizedDomainAliases(),
                'alias_subdomain' => $tenant->alias_subdomain ?: 'contact',
                'host_mode' => $tenant->isLinkHubHost(
                    \App\Services\LinkHub\LinkHubAliasService::normalizeHost(
                        (string) ($request->header('X-Tenant-Domain') ?: $request->getHost())
                    )
                ) ? 'link-hub' : 'primary',
                'store_display_name' => $tenant->store_display_name,
                'business_category_slug' => $tenant->business_category_slug,
                'business_type_slug' => $tenant->business_type_slug,
                'site_type_slug' => $tenant->site_type_slug,
                'theme_preset' => $tenant->theme_preset,
                'active_theme_slug' => $tenant->active_theme_slug,
                'branding' => $branding,
                'guest_checkout' => $guestCheckout,
                'account_creation' => ($privacy['account_creation'] ?? true) !== false,
                'nav_preset' => $tenant->nav_preset,
                'site_status' => app(\App\Services\Site\SiteStatusService::class)->get((int) $tenant->id),
                'otp_auth' => [
                    'login_enabled' => (bool) ($otp['otp_login_enabled'] ?? false),
                    'register_enabled' => (bool) ($otp['otp_register_enabled'] ?? false),
                    'length' => (int) ($otp['otp_length'] ?? 5),
                ],
            ],
        ])->header('Cache-Control', 'public, max-age=60, s-maxage=120');
    }

    /** Public site lifecycle status (coming_soon / suspended pages). Not cached by CDN. */
    public function siteStatus(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $s = app(\App\Services\Site\SiteStatusService::class)->get((int) $tenant->id);
        unset($s['updated_by']);
        $s['name'] = $tenant->store_display_name ?: $tenant->name;

        return response()->json(['data' => $s])->header('Cache-Control', 'no-store');
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
