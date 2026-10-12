<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;

/**
 * Update the live tenant primary domain + aliases after an ERP domain change.
 * Unlike webino:provision-bootstrap this always runs (setup_completed ignored).
 */
class SyncTenantDomainCommand extends Command
{
    protected $signature = 'webino:sync-domain
        {domain : New primary hostname}
        {--aliases= : Comma-separated alias hostnames}
        {--alias-subdomain=contact : LinkHub label stored on the tenant}';

    protected $description = 'Sync tenants.domain / domain_aliases after a platform domain change';

    public function handle(): int
    {
        $domain = strtolower(trim((string) $this->argument('domain')));
        $domain = preg_replace('#^https?://#', '', $domain) ?? $domain;
        $domain = explode('/', $domain)[0] ?? $domain;
        $domain = preg_replace('/^www\./', '', $domain) ?? $domain;
        if ($domain === '' || ! str_contains($domain, '.')) {
            $this->error('Invalid domain');

            return self::FAILURE;
        }

        $tenant = Tenant::query()->orderBy('id')->first();
        if (! $tenant) {
            $this->error('No tenant found');

            return self::FAILURE;
        }

        $aliases = [];
        $raw = (string) $this->option('aliases');
        foreach (preg_split('/\s*,\s*/', $raw) ?: [] as $item) {
            $host = strtolower(trim($item));
            $host = preg_replace('#^https?://#', '', $host) ?? $host;
            $host = explode('/', $host)[0] ?? $host;
            $host = preg_replace('/^www\./', '', $host) ?? $host;
            if ($host !== '' && str_contains($host, '.') && $host !== $domain) {
                $aliases[] = $host;
            }
        }
        $aliases = array_values(array_unique($aliases));

        $tenant->domain = $domain;
        $tenant->domain_aliases = $aliases;
        $tenant->alias_subdomain = (string) ($this->option('alias-subdomain') ?: 'contact');
        $tenant->license_key = $domain;
        $tenant->save();

        $this->info("Synced tenant #{$tenant->id} domain={$domain} aliases=".json_encode($aliases, JSON_UNESCAPED_UNICODE));

        return self::SUCCESS;
    }
}
