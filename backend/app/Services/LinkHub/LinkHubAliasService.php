<?php

namespace App\Services\LinkHub;

use App\Models\Tenant;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final class LinkHubAliasService
{
    public static function normalizeLabel(?string $label): string
    {
        $label = strtolower(trim((string) $label));
        $label = preg_replace('/[^a-z0-9-]/', '', $label) ?: 'contact';
        $label = trim($label, '-');
        if ($label === '' || strlen($label) > 63) {
            return 'contact';
        }

        return $label;
    }

    public static function normalizeHost(?string $host): string
    {
        $host = strtolower(trim((string) $host));
        $host = preg_replace('#^https?://#', '', $host) ?? $host;
        $host = explode('/', $host)[0] ?? $host;
        $host = preg_replace('/:\d+$/', '', $host) ?? $host;

        return preg_replace('/^www\./', '', $host) ?? $host;
    }

    public static function hostnameFor(Tenant $tenant, ?string $label = null): ?string
    {
        $primary = self::normalizeHost((string) $tenant->domain);
        if ($primary === '' || ! str_contains($primary, '.')) {
            return null;
        }
        $label = self::normalizeLabel($label ?? $tenant->alias_subdomain ?? 'contact');

        return $label.'.'.$primary;
    }

    /**
     * Persist local aliases and optionally ask ERP to rewrite Caddy/SSL.
     *
     * @return array{alias_subdomain:string,alias_hostname:?string,domain_aliases:list<string>,erp_synced:bool,erp_message:?string}
     */
    public function apply(Tenant $tenant, string $label): array
    {
        $label = self::normalizeLabel($label);
        $host = self::hostnameFor($tenant, $label);
        $aliases = $host ? [$host] : [];

        $tenant->alias_subdomain = $label;
        $tenant->domain_aliases = $aliases;
        $tenant->save();

        $erp = $this->syncToErp($tenant, $label);

        return [
            'alias_subdomain' => $label,
            'alias_hostname' => $host,
            'domain_aliases' => $aliases,
            'erp_synced' => $erp['ok'],
            'erp_message' => $erp['message'],
        ];
    }

    /**
     * @return array{ok:bool,message:?string}
     */
    public function syncToErp(Tenant $tenant, string $label): array
    {
        $baseUrl = rtrim((string) config('services.webino.base_url'), '/');
        $token = (string) ($tenant->provision_token ?? '');
        $secret = (string) config('services.webino.provision_hmac_secret', '');
        if ($secret === '') {
            $secret = (string) config('services.webino.license_hmac_secret', '');
        }

        if ($baseUrl === '' || $token === '' || $secret === '') {
            return ['ok' => false, 'message' => 'ERP sync skipped (missing base URL, token, or HMAC secret).'];
        }

        $body = ['alias_subdomain' => self::normalizeLabel($label)];
        $raw = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($raw === false) {
            return ['ok' => false, 'message' => 'Failed to encode payload.'];
        }

        try {
            $res = Http::timeout(30)
                ->withHeaders([
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                    'X-Provision-Token' => $token,
                    'X-Provision-Signature' => hash_hmac('sha256', $raw, $secret),
                ])
                ->withBody($raw, 'application/json')
                ->post($baseUrl.'/api/v1/site-builder/sync/alias');
        } catch (\Throwable $e) {
            Log::warning('LinkHub alias ERP sync failed', ['error' => $e->getMessage()]);

            return ['ok' => false, 'message' => $e->getMessage()];
        }

        if (! $res->successful()) {
            return ['ok' => false, 'message' => 'ERP HTTP '.$res->status().': '.$res->body()];
        }

        $aliases = $res->json('data.domain_aliases');
        if (is_array($aliases)) {
            $tenant->domain_aliases = array_values(array_filter(array_map('strval', $aliases)));
            $tenant->save();
        }

        return ['ok' => true, 'message' => null];
    }
}
