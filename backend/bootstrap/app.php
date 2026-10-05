<?php

use App\Http\Middleware\EnsureModuleEnabled;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);

        // Trust only configured proxies. `*` would let a client that can reach
        // PHP directly rotate X-Forwarded-For and skip the login limiter.
        // Loopback is the default (Caddy on the same host). Set TRUSTED_PROXIES
        // to the edge proxy address; the value `*` is ignored.
        $trustedProxies = array_values(array_filter(
            array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1'))),
            static fn (string $proxy): bool => $proxy !== '' && $proxy !== '*' && $proxy !== '**',
        ));
        if ($trustedProxies === []) {
            $trustedProxies = ['127.0.0.1', '::1'];
        }
        $middleware->trustProxies(
            at: $trustedProxies,
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
                | Request::HEADER_X_FORWARDED_AWS_ELB
        );

        $middleware->encryptCookies(except: [
            (string) ($_ENV['AUTH_COOKIE_NAME']
                ?? $_SERVER['AUTH_COOKIE_NAME']
                ?? 'webino_auth_token'),
            'torob_clid',
        ]);

        // Cookie+Bearer SPA — not Sanctum session auth. Do NOT enable
        // EnsureFrontendRequestsAreStateful: CSRF/session on /api/* breaks
        // login and setup when APP_URL host matches SANCTUM_STATEFUL_DOMAINS
        // (same rationale as WebinoERP).
        $middleware->validateCsrfTokens(except: [
            'api/*',
            'sanctum/csrf-cookie',
        ]);

        $middleware->api(prepend: [
            \App\Http\Middleware\ForceJsonResponse::class,
            \App\Http\Middleware\ApiResponseFormatter::class,
            \App\Http\Middleware\AuthenticateFromCookie::class,
            \App\Http\Middleware\EnsureUserIsActive::class,
            \App\Http\Middleware\RequireAjaxHeader::class,
            \App\Http\Middleware\WafGuard::class,
        ]);
        $middleware->api(append: [
            \App\Http\Middleware\RequirePasswordChange::class,
            \App\Http\Middleware\RequireTwoFactor::class,
            \App\Http\Middleware\ThrottleApiToken::class,
            \App\Http\Middleware\SecurityHeaders::class,
        ]);
        $middleware->alias([
            'module' => EnsureModuleEnabled::class,
            'staff' => \App\Http\Middleware\EnsureStaffRole::class,
            'can' => \App\Http\Middleware\EnsureCapability::class,
            'site_type' => \App\Http\Middleware\EnsureSiteType::class,
            'user.active' => \App\Http\Middleware\EnsureUserIsActive::class,
            'public.module' => \App\Http\Middleware\EnsurePublicModuleEnabled::class,
            'public.tenant' => \App\Http\Middleware\ResolvePublicTenant::class,
            'token.scope' => \App\Http\Middleware\RestrictScopedApiTokens::class,
        ]);
        // Reject non-staff before route-model binding so record ids cannot be probed.
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: \App\Http\Middleware\EnsureStaffRole::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function (Request $request, \Throwable $e): bool {
            return $request->is('api/*') || $request->expectsJson();
        });
    })->create();
