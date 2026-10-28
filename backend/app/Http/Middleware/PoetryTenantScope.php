<?php

namespace App\Http\Middleware;

use App\Services\Poetry\PoetryScope;
use App\Services\Poetry\PoetryTaxonomy;
use App\Services\Tenant\TenantResolver;
use Closure;
use Illuminate\Http\Request;

class PoetryTenantScope
{
    public function handle(Request $request, Closure $next)
    {
        // Public routes: host tenant (ResolvePublicTenant). Admin routes: the user's tenant; a user without one
        // (platform/impersonating admin) falls back to the same host-resolved tenant the public site shows,
        // instead of a 404 that the admin UI rendered as «شعری ثبت نشده است».
        $tid = (int) ($request->attributes->get('public_tenant_id') ?: ($request->user()?->tenant_id ?? 0));
        if ($tid <= 0 && $request->user()) {
            $tid = (int) (app(TenantResolver::class)->resolveFromRequest($request)?->id ?? 0);
        }
        abort_if($tid <= 0, 404);
        $previous = PoetryScope::current();
        PoetryScope::set($tid);
        PoetryTaxonomy::ensure($tid);
        try {
            return $next($request);
        } finally {
            PoetryScope::set($previous);
        }
    }
}
