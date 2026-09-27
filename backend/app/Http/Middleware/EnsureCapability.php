<?php

namespace App\Http\Middleware;

use App\Support\CapabilityChecker;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCapability
{
    public function __construct(
        private readonly CapabilityChecker $capabilities,
    ) {}

    public function handle(Request $request, Closure $next, string ...$required): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => __('api.unauthorized')], 401);
        }

        foreach ($required as $capability) {
            if ($this->capabilities->allows($user, $capability)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => __('api.forbidden'),
            'errors' => ['code' => 'CAPABILITY_DENIED'],
        ], 403);
    }
}
