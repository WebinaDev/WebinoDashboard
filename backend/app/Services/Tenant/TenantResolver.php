<?php

namespace App\Services\Tenant;

use App\Models\Tenant;
use Illuminate\Http\Request;

class TenantResolver
{
    /** Hostnames used by Docker/internal probes — never treat as tenant domains. */
    private const INTERNAL_HOSTS = [
        'backend',
        'frontend',
        'localhost',
        '127.0.0.1',
        '::1',
        '0.0.0.0',
    ];

    public function resolveFromRequest(Request $request): ?Tenant
    {
        $host = $this->normalizeHost($request->getHost());

        if ($host !== '' && ! $this->isInternalHost($host)) {
            $tenant = Tenant::query()
                ->where(function ($q) use ($host): void {
                    $q->where('domain', $host)
                        ->orWhere('domain', 'www.'.$host);
                })
                ->first();

            if ($tenant) {
                return $tenant;
            }
        }

        return Tenant::query()->orderBy('id')->first();
    }

    public function normalizeHost(string $host): string
    {
        $host = strtolower(trim($host));
        // Strip port if present (e.g. backend:8080).
        if (str_contains($host, ':') && ! str_starts_with($host, '[')) {
            $host = explode(':', $host, 2)[0];
        }
        if (str_starts_with($host, 'www.')) {
            $host = substr($host, 4);
        }

        return $host;
    }

    public function isInternalHost(string $host): bool
    {
        $host = $this->normalizeHost($host);

        return $host === ''
            || in_array($host, self::INTERNAL_HOSTS, true)
            || str_ends_with($host, '.internal')
            || str_ends_with($host, '.localdomain');
    }
}
