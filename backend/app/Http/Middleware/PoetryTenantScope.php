<?php

namespace App\Http\Middleware;

use App\Services\Poetry\PoetryScope;
use App\Services\Poetry\PoetryTaxonomy;
use Closure;
use Illuminate\Http\Request;

class PoetryTenantScope
{
    public function handle(Request $request, Closure $next)
    {
        $tid = (int) ($request->attributes->get('public_tenant_id') ?: ($request->user()?->tenant_id ?? 0));
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
