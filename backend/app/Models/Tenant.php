<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'domain',
        'domain_aliases',
        'alias_subdomain',
        'license_key',
        'license_status',
        'license_checked_at',
        'license_unreachable',
        'license_last_error',
        'setup_completed',
        'store_display_name',
        'default_currency',
        'business_category_slug',
        'business_type_slug',
        'site_type_slug',
        'default_locale',
        'vertical',
        'package_sku',
        'theme_preset',
        'active_theme_slug',
        'nav_preset',
        'branding',
        'home_blocks',
        'provision_token',
        'crm_account_id',
        'suspended_at',
        'suspension_reason',
    ];

    protected function casts(): array
    {
        return [
            'setup_completed' => 'boolean',
            'license_unreachable' => 'boolean',
            'license_checked_at' => 'datetime',
            'suspended_at' => 'datetime',
            'nav_preset' => 'array',
            'branding' => 'array',
            'home_blocks' => 'array',
            'domain_aliases' => 'array',
        ];
    }

    /** @return list<string> */
    public function normalizedDomainAliases(): array
    {
        $aliases = $this->domain_aliases;
        if (! is_array($aliases)) {
            return [];
        }

        $out = [];
        foreach ($aliases as $alias) {
            if (! is_string($alias)) {
                continue;
            }
            $host = strtolower(trim($alias));
            $host = preg_replace('#^https?://#', '', $host) ?? $host;
            $host = explode('/', $host)[0] ?? $host;
            $host = preg_replace('/:\d+$/', '', $host) ?? $host;
            $host = preg_replace('/^www\./', '', $host) ?? $host;
            if ($host !== '' && str_contains($host, '.')) {
                $out[] = $host;
            }
        }

        return array_values(array_unique($out));
    }

    public function isLinkHubHost(string $host): bool
    {
        $host = strtolower(trim($host));
        $host = preg_replace('/^www\./', '', $host) ?? $host;

        return in_array($host, $this->normalizedDomainAliases(), true);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(TenantModule::class);
    }

    /** Normalize ERP/legacy statuses: valid → active. */
    public function normalizedLicenseStatus(): string
    {
        $status = (string) ($this->license_status ?? '');
        if ($status === 'valid') {
            return 'active';
        }

        return $status !== '' ? $status : 'unknown';
    }

    /** Entitled to use the product (active or demo). Matches LicenseController payload. */
    public function isLicenseEntitled(): bool
    {
        if ($this->isSuspended()) {
            return false;
        }

        return in_array($this->normalizedLicenseStatus(), ['active', 'demo'], true);
    }

    public function isLicenseDemo(): bool
    {
        return $this->normalizedLicenseStatus() === 'demo';
    }

    /** Suspended by ERP (Customer 360 Hub → suspend). Reversible via /erp-link/suspension. */
    public function isSuspended(): bool
    {
        return $this->suspended_at !== null;
    }
}
