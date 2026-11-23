<?php

namespace App\Http\Middleware;

use App\Support\Audit\AuditBatch;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gives each request its own audit batch, and releases it afterwards.
 *
 * `AuditBatch` memoises a uuid on first use. Under php-fpm that static dies with the
 * process, but a queue worker or Octane keeps it alive: without a reset the next request
 * would inherit the previous one's batch id and unrelated changes would appear to belong
 * to a single bulk edit.
 */
class AssignAuditBatch
{
    public function handle(Request $request, Closure $next): Response
    {
        AuditBatch::reset();

        try {
            return $next($request);
        } finally {
            AuditBatch::reset();
        }
    }
}
