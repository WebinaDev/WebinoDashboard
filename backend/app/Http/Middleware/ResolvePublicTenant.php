<?php

namespace App\Http\Middleware;

use App\Services\Tenant\TenantResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolvePublicTenant
{
    public function __construct(private readonly TenantResolver $resolver) {}

    public function handle(Request $request, Closure $next): Response
    {
        $tenant = $this->resolver->resolveFromRequest($request);
        if (! $tenant) {
            return response()->json(['message' => 'Tenant not found'], 404);
        }

        $request->attributes->set('public_tenant', $tenant);
        $request->attributes->set('public_tenant_id', $tenant->id);

        return $next($request);
    }
}
