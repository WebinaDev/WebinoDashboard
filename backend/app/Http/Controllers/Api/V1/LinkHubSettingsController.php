<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\LinkHub\LinkHubAliasService;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Http\Request;

class LinkHubSettingsController extends Controller
{
    public function show(Request $request, ModuleSettingsService $settings, LinkHubAliasService $aliases): \Illuminate\Http\JsonResponse
    {
        $tenant = $request->user()->tenant;
        $tid = (int) $tenant->id;
        $stored = $settings->get($tid, 'link-hub', 'settings', self::defaults());
        $host = LinkHubAliasService::hostnameFor($tenant);

        return response()->json([
            'data' => array_merge(self::defaults(), $stored, [
                'alias_subdomain' => LinkHubAliasService::normalizeLabel(
                    $tenant->alias_subdomain ?? ($stored['alias_subdomain'] ?? 'contact')
                ),
                'alias_hostname' => $host,
                'domain_aliases' => $tenant->normalizedDomainAliases(),
                'primary_domain' => $tenant->domain,
                'dns_hint' => $host
                    ? 'یک رکورد A/AAAA برای '.$host.' به همان IP سرور سایت بسازید. بعد از ذخیره، SSL از طریق Caddy ساخته می‌شود.'
                    : null,
            ]),
        ]);
    }

    public function update(Request $request, ModuleSettingsService $settings, LinkHubAliasService $aliases): \Illuminate\Http\JsonResponse
    {
        $tenant = $request->user()->tenant;
        $tid = (int) $tenant->id;

        $data = $request->validate([
            'alias_subdomain' => 'nullable|string|max:63',
            'qr_foreground' => 'nullable|string|max:32',
            'qr_background' => 'nullable|string|max:32',
            'default_theme' => 'nullable|array',
        ]);

        $current = $settings->get($tid, 'link-hub', 'settings', self::defaults());
        $merged = array_merge($current, array_filter([
            'qr_foreground' => $data['qr_foreground'] ?? null,
            'qr_background' => $data['qr_background'] ?? null,
            'default_theme' => $data['default_theme'] ?? null,
        ], fn ($v) => $v !== null));

        $aliasResult = null;
        if (array_key_exists('alias_subdomain', $data) && $data['alias_subdomain'] !== null) {
            $aliasResult = $aliases->apply($tenant->fresh(), $data['alias_subdomain']);
            $merged['alias_subdomain'] = $aliasResult['alias_subdomain'];
        }

        $settings->put($tid, 'link-hub', 'settings', $merged);
        $tenant->refresh();

        return response()->json([
            'data' => array_merge($merged, [
                'alias_subdomain' => LinkHubAliasService::normalizeLabel($tenant->alias_subdomain ?? 'contact'),
                'alias_hostname' => LinkHubAliasService::hostnameFor($tenant),
                'domain_aliases' => $tenant->normalizedDomainAliases(),
                'primary_domain' => $tenant->domain,
                'erp_synced' => $aliasResult['erp_synced'] ?? null,
                'erp_message' => $aliasResult['erp_message'] ?? null,
                'dns_hint' => ($h = LinkHubAliasService::hostnameFor($tenant))
                    ? 'یک رکورد A/AAAA برای '.$h.' به همان IP سرور سایت بسازید. بعد از ذخیره، SSL از طریق Caddy ساخته می‌شود.'
                    : null,
            ]),
        ]);
    }

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            'alias_subdomain' => 'contact',
            'qr_foreground' => '#111827',
            'qr_background' => '#ffffff',
            'default_theme' => [
                'accent' => '#0f766e',
                'background' => '#f1f5f9',
            ],
        ];
    }
}
