<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Site default language for every site type (tenants.default_locale): fa (RTL, Jalali) or en (LTR, Gregorian). */
class SiteLanguageController extends Controller
{
    use ResolvesPublicTenant;

    public const LANGS = ['fa' => ['dir' => 'rtl', 'calendar' => 'jalali', 'name' => 'فارسی'], 'en' => ['dir' => 'ltr', 'calendar' => 'gregorian', 'name' => 'English']];

    public function show(Request $request): JsonResponse
    {
        return $this->payload(Tenant::query()->findOrFail($request->user()->tenant_id));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['default_locale' => ['required', 'in:fa,en']]);
        $tenant = Tenant::query()->findOrFail($request->user()->tenant_id);
        $tenant->default_locale = $data['default_locale'];
        $tenant->save();

        return $this->payload($tenant);
    }

    public function publicShow(Request $request): JsonResponse
    {
        return $this->payload(Tenant::query()->findOrFail($this->publicTenantId($request)));
    }

    private function payload(Tenant $t): JsonResponse
    {
        $lang = $t->default_locale ?: 'fa';

        return response()->json(['data' => ['default_locale' => $lang, 'available' => self::LANGS] + (self::LANGS[$lang] ?? self::LANGS['fa'])]);
    }
}
