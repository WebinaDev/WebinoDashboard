<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Services\Cafe\CafeOrdering;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class PublicCafeController extends Controller
{
    use ResolvesPublicTenant;

    public function venue(Request $request, ModuleSettingsService $settings, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $tid = $tenant->id;

        return response()->json([
            'data' => [
                'tenant' => [
                    'name' => $tenant->store_display_name ?? $tenant->name,
                    'active_theme_slug' => $tenant->active_theme_slug,
                ],
                'menu' => $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults()),
                'hours' => $settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults()),
                'gallery' => $settings->get($tid, 'cafe', 'gallery', ModuleSettingsService::cafeGalleryDefaults()),
                'venue' => $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults()),
                'ordering' => $ordering->publicStatus($tid),
            ],
        ])->header('Cache-Control', 'no-cache, must-revalidate');
    }

    /**
     * Everything the public /contact page shows, in one uncached read. The page is opt-in per tenant
     * (venue.contact_page_enabled). Links, socials and the contact form come from the link-hub business
     * profile when that module is on; venue settings fill whatever the link hub leaves empty.
     */
    public function contact(Request $request, ModuleSettingsService $settings, CafeOrdering $ordering): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $tid = (int) $tenant->id;
        $venue = $settings->get($tid, 'cafe', 'venue', ModuleSettingsService::cafeVenueDefaults());
        if (empty($venue['contact_page_enabled'])) {
            return response()->json(['message' => __('api.cafe_contact_disabled')], 404)->header('Cache-Control', 'no-store');
        }
        $menu = $settings->get($tid, 'cafe', 'menu', ModuleSettingsService::cafeMenuDefaults());
        $hours = $settings->get($tid, 'cafe', 'hours', ModuleSettingsService::cafeHoursDefaults());

        $hubContact = [];
        $links = [];
        $form = null;
        $profileMeta = null;
        if (app(\App\Kernel\TenantActivationService::class)->isModuleEnabled($tid, 'link-hub')) {
            $profile = \App\Models\LinkHubProfile::query()
                ->where('tenant_id', $tid)
                ->where('is_published', true)
                ->where('kind', \App\Models\LinkHubProfile::KIND_BUSINESS)
                ->first();
            if ($profile) {
                $profileMeta = ['title' => $profile->title, 'bio' => $profile->bio, 'avatar_url' => $profile->avatar_url];
                foreach ($profile->blocks()->where('is_visible', true)->orderBy('sort')->get() as $block) {
                    $p = is_array($block->payload) ? $block->payload : [];
                    if ($block->type === 'contact') {
                        foreach ($p as $k => $v) {
                            if (! isset($hubContact[$k]) || $hubContact[$k] === '' || $hubContact[$k] === []) {
                                $hubContact[$k] = $v;
                            }
                        }
                    } elseif ($block->type === 'link' && filled($p['url'] ?? null)) {
                        $links[] = ['id' => $block->id, 'label' => (string) ($p['label'] ?? ''), 'url' => (string) $p['url'], 'icon' => (string) ($p['icon'] ?? 'link')];
                    } elseif ($block->type === 'form' && $form === null) {
                        $form = [
                            'id' => $block->id,
                            'title' => $p['title'] ?? null,
                            'submit_label' => $p['submit_label'] ?? null,
                            'fields' => is_array($p['fields'] ?? null) ? array_values($p['fields']) : [
                                ['name' => 'name', 'label' => 'نام', 'type' => 'text', 'required' => true],
                                ['name' => 'phone', 'label' => 'موبایل', 'type' => 'tel', 'required' => true],
                                ['name' => 'message', 'label' => 'پیام', 'type' => 'textarea', 'required' => false],
                            ],
                        ];
                    }
                }
            }
        }
        $pick = fn (string $hubKey, ?string $venueKey = null) => self::clean($hubContact[$hubKey] ?? null) ?? ($venueKey ? self::clean($venue[$venueKey] ?? null) : null);
        $socials = [];
        foreach (is_array($hubContact['socials'] ?? null) ? $hubContact['socials'] : [] as $row) {
            if (is_array($row) && self::clean($row['url'] ?? null)) {
                $socials[] = ['label' => (string) ($row['label'] ?? ''), 'url' => (string) $row['url']];
            }
        }

        $now = now();
        $open = CafeOrdering::openAt($hours, $now);
        $lat = is_numeric($menu['cafe_lat'] ?? null) ? (float) $menu['cafe_lat'] : null;
        $lng = is_numeric($menu['cafe_lng'] ?? null) ? (float) $menu['cafe_lng'] : null;
        $branding = is_array($tenant->branding) ? $tenant->branding : [];

        $branches = \App\Models\CafeBranch::query()
            ->where('tenant_id', $tid)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name_fa', 'name_en', 'slug', 'address_fa', 'address_en', 'phone'])
            ->toArray();

        return response()->json([
            'data' => [
                'tenant' => [
                    'name' => $tenant->store_display_name ?: $tenant->name,
                    'domain' => $tenant->domain,
                    'active_theme_slug' => $tenant->active_theme_slug,
                    'logo_url' => $branding['logo_url'] ?? $profileMeta['avatar_url'] ?? null,
                    'logo_dark_url' => $branding['logo_dark_url'] ?? null,
                ],
                'tagline_fa' => self::clean($venue['tagline_fa'] ?? null) ?? self::clean($profileMeta['bio'] ?? null),
                'tagline_en' => self::clean($venue['tagline_en'] ?? null),
                'accent_color' => $menu['accent_color'] ?? null,
                'contact' => [
                    'phone' => $pick('phone', 'phone'),
                    'email' => $pick('email', 'email'),
                    'whatsapp' => $pick('whatsapp', 'whatsapp_url'),
                    'telegram' => $pick('telegram', 'telegram_url'),
                    'bale' => $pick('bale', 'bale_url'),
                    'instagram' => $pick('instagram', 'instagram'),
                    'website' => $pick('website', 'website_url'),
                    'address_fa' => $pick('address', 'address_fa'),
                    'address_en' => self::clean($venue['address_en'] ?? null),
                    'map_url' => self::clean($venue['map_url'] ?? null),
                ],
                'socials' => $socials,
                'links' => $links,
                'form' => $form,
                'location' => $lat !== null && $lng !== null ? ['lat' => $lat, 'lng' => $lng] : null,
                'hours' => [
                    'timezone' => $hours['timezone'] ?? 'Asia/Tehran',
                    'days' => is_array($hours['days'] ?? null) ? array_values($hours['days']) : [],
                    'closed_dates' => array_values(array_filter(
                        is_array($hours['closed_dates'] ?? null) ? $hours['closed_dates'] : [],
                        fn ($d) => is_string($d) && $d >= $now->copy()->timezone((string) ($hours['timezone'] ?? 'Asia/Tehran'))->toDateString()
                    )),
                    'is_open' => $open['is_open'],
                    'reason' => $open['reason'],
                ],
                'branches' => $branches,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    private static function clean(mixed $v): ?string
    {
        if (! is_scalar($v)) {
            return null;
        }
        $s = trim((string) $v);

        return $s === '' ? null : $s;
    }
}
