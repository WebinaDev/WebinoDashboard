<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\Tenant;
use Illuminate\Http\Request;

trait ResolvesPublicTenant
{
    protected function publicTenant(Request $request): Tenant
    {
        /** @var Tenant $tenant */
        $tenant = $request->attributes->get('public_tenant');

        return $tenant;
    }

    protected function publicTenantId(Request $request): int
    {
        return (int) $request->attributes->get('public_tenant_id');
    }
}
