<?php

namespace App\Services\Tenant;

use App\Models\Tenant;
use Illuminate\Http\Request;

class TenantResolver
{
    public function resolveFromRequest(Request $request): ?Tenant
    {
        $host = $this->normalizeHost($request->getHost());

        if ($host !== '') {
            $tenant = Tenant::query()
                ->where('domain', $host)
                ->orWhere('domain', 'www.'.$host)
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
        if (str_starts_with($host, 'www.')) {
            $host = substr($host, 4);
        }

        return $host;
    }
}
