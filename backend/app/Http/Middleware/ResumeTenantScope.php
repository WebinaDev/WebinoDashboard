<?php

namespace App\Http\Middleware;

use App\Services\Resume\ResumeScope;
use Closure;
use Illuminate\Http\Request;

class ResumeTenantScope
{
    public function handle(Request $request, Closure $next)
    {
        $tid = (int) ($request->attributes->get('public_tenant_id') ?: ($request->user()?->tenant_id ?? 0));
        abort_if($tid <= 0, 404);
        $previous = ResumeScope::current();
        ResumeScope::set($tid);
        try {
            return $next($request);
        } finally {
            ResumeScope::set($previous);
        }
    }
}
