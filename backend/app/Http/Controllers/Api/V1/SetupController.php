<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Kernel\SiteTypeProfiles;
use App\Kernel\TenantActivationService;
use App\Models\Tenant;
use App\Models\User;
use App\Http\Controllers\Api\V1\ThemeBuilderController;
use App\Services\Webino\WebinoLicenseClient;
use Illuminate\Http\Request;

class SetupController extends Controller
{
    public function status(Request $request): \Illuminate\Http\JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $tenant = $user->tenant;

        return response()->json([
            'data' => [
                'setup_completed' => (bool) ($tenant?->setup_completed ?? true),
                'site_type_selected' => filled($tenant?->site_type_slug),
                'site_types' => collect(SiteTypeProfiles::all())->map(fn ($p, $slug) => [
                    'slug' => $slug,
                    'name_fa' => $p['name_fa'],
                    'name_en' => $p['name_en'],
                    'default_theme_slug' => $p['theme'],
                ])->values(),
                'tenant' => [
                    'id' => $tenant?->id,
                    'name' => $tenant?->name,
                    'slug' => $tenant?->slug,
                    'domain' => $tenant?->domain,
                    'domain_configured' => filled($tenant?->domain),
                    'license_key_configured' => filled($tenant?->domain), // BC: domain is license identity
                    'store_display_name' => $tenant?->store_display_name,
                    'default_currency' => $tenant?->default_currency ?? 'IRT',
                    'default_locale' => $tenant?->default_locale ?? 'fa',
                    'site_type_slug' => $tenant?->site_type_slug,
                    'business_category_slug' => $tenant?->business_category_slug,
                    'business_type_slug' => $tenant?->business_type_slug,
                    'vertical' => $tenant?->vertical,
                    'package_sku' => $tenant?->package_sku,
                    'theme_preset' => $tenant?->theme_preset,
                    'active_theme_slug' => $tenant?->active_theme_slug,
                    'nav_preset' => $tenant?->nav_preset,
                    'branding' => $tenant?->branding,
                    'currency_symbol' => self::normalizeCurrencySymbol(
                        (string) ($tenant?->default_currency ?? 'IRT'),
                        is_array($tenant?->branding) ? ($tenant->branding['currency_symbol'] ?? null) : null
                    ),
                ],
                'user_role' => $user->role,
            ],
        ]);
    }

    public function applySiteType(Request $request, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'site_type_slug' => ['required', 'string', 'in:'.implode(',', SiteTypeProfiles::TYPES)],
        ]);

        $tenant = $request->user()?->tenant;
        if (! $tenant instanceof Tenant) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        $activations->applySiteType($tenant, $data['site_type_slug']);

        return response()->json([
            'data' => $tenant->fresh(),
        ]);
    }

    public function updateStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'store_display_name' => ['nullable', 'string', 'max:255'],
            'default_currency' => ['nullable', 'string', 'in:IRT,IRR'],
            'currency_symbol' => ['nullable', 'string', 'in:default,toman-1,toman-2,rial-1,rial-2'],
            'default_locale' => ['nullable', 'string', 'in:fa,en'],
            'tenant_name' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;
        if (array_key_exists('tenant_name', $data) && filled($data['tenant_name'])) {
            $tenant->name = $data['tenant_name'];
        }
        if (array_key_exists('store_display_name', $data)) {
            $tenant->store_display_name = $data['store_display_name'];
        }
        if (array_key_exists('default_currency', $data) && $data['default_currency'] !== null && $data['default_currency'] !== '') {
            $tenant->default_currency = $data['default_currency'];
        }
        if (array_key_exists('default_locale', $data) && filled($data['default_locale'])) {
            $tenant->default_locale = $data['default_locale'];
        }

        $currency = (string) ($tenant->default_currency ?: 'IRT');
        if (array_key_exists('currency_symbol', $data) || array_key_exists('default_currency', $data)) {
            $branding = is_array($tenant->branding) ? $tenant->branding : [];
            $requested = $data['currency_symbol'] ?? ($branding['currency_symbol'] ?? null);
            $branding['currency_symbol'] = self::normalizeCurrencySymbol($currency, is_string($requested) ? $requested : null);
            $tenant->branding = $branding;
        }

        $tenant->save();

        return response()->json(['data' => $tenant->fresh()]);
    }

    /**
     * @return 'default'|'toman-1'|'toman-2'|'rial-1'|'rial-2'
     */
    public static function normalizeCurrencySymbol(string $currency, ?string $symbol): string
    {
        $currency = strtoupper($currency) === 'IRR' ? 'IRR' : 'IRT';
        $allowed = $currency === 'IRR'
            ? ['rial-1', 'rial-2']
            : ['default', 'toman-1', 'toman-2'];
        $id = is_string($symbol) ? trim($symbol) : '';

        if (in_array($id, $allowed, true)) {
            return $id;
        }

        return $currency === 'IRR' ? 'rial-1' : 'default';
    }

    public function updateCrm(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'domain' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;
        if (array_key_exists('domain', $data)) {
            $tenant->domain = $data['domain'] !== '' ? $data['domain'] : null;
            // Deprecated column: keep in sync with domain for old rows; not used for entitlement.
            $tenant->license_key = $tenant->domain;
        }
        $tenant->save();

        return response()->json(['data' => $tenant->fresh()]);
    }

    public function syncLicense(Request $request, WebinoLicenseClient $client): \Illuminate\Http\JsonResponse
    {
        return app(LicenseController::class)->sync($request, $client);
    }

    public function importDemo(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate(['preset' => ['nullable', 'string', 'max:64']]);
        $preset = $request->input('preset', 'ishop-kit');

        return app(ThemeBuilderController::class)->apply($request->merge(['preset' => $preset]));
    }

    public function complete(Request $request, TenantActivationService $activations): \Illuminate\Http\JsonResponse
    {
        /** @var Tenant $tenant */
        $tenant = $request->user()->tenant;

        $locale = $tenant->default_locale ?: 'fa';
        if (in_array($locale, ['fa', 'en'], true)) {
            app()->setLocale($locale);
        }

        if (! filled($tenant->name)) {
            return response()->json(['message' => __('api.tenant_name_required')], 422);
        }

        if (! filled($tenant->site_type_slug)) {
            $data = $request->validate([
                'site_type_slug' => ['nullable', 'string', 'max:64'],
            ]);
            $candidate = $data['site_type_slug'] ?? $tenant->business_type_slug;
            if (is_string($candidate) && SiteTypeProfiles::isValid($candidate)) {
                $activations->applySiteType($tenant, $candidate);
                $tenant->refresh();
            }
        }

        if (! filled($tenant->site_type_slug)) {
            return response()->json(['message' => __('api.site_type_required')], 422);
        }

        $tenant->setup_completed = true;
        $tenant->save();

        return response()->json(['data' => ['setup_completed' => true]]);
    }
}
