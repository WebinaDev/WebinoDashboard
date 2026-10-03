<?php

use App\Http\Middleware\ApiResponseFormatter;
use App\Http\Middleware\AuthenticateFromCookie;
use App\Http\Middleware\EnsureCapability;
use App\Http\Middleware\EnsureModuleEnabled;
use App\Http\Middleware\EnsurePublicModuleEnabled;
use App\Http\Middleware\EnsureStaffRole;
use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\RequireAjaxHeader;
use App\Http\Middleware\RequirePasswordChange;
use App\Http\Middleware\RequireTwoFactor;
use App\Http\Middleware\ResolvePublicTenant;
use App\Http\Middleware\RestrictScopedApiTokens;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\ThrottleApiToken;
use App\Http\Middleware\WafGuard;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);

        // Caddy (and any reverse proxy) sits in front — trust X-Forwarded-* so
        // $request->ip() / isSecure() / URL generation are correct.
        $middleware->trustProxies(
            at: '*',
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
            'webino_staff_impersonate',
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
            ForceJsonResponse::class,
            ApiResponseFormatter::class,
            AuthenticateFromCookie::class,
            EnsureUserIsActive::class,
            RequireAjaxHeader::class,
            WafGuard::class,
        ]);
        $middleware->api(append: [
            RequirePasswordChange::class,
            RequireTwoFactor::class,
            ThrottleApiToken::class,
            SecurityHeaders::class,
        ]);
        $middleware->alias([
            'module' => EnsureModuleEnabled::class,
            'staff' => EnsureStaffRole::class,
            'can' => EnsureCapability::class,
            'user.active' => EnsureUserIsActive::class,
            'public.module' => EnsurePublicModuleEnabled::class,
            'public.tenant' => ResolvePublicTenant::class,
            'token.scope' => RestrictScopedApiTokens::class,
        ]);
        // Reject non-staff before route-model binding so record ids cannot be probed.
        $middleware->prependToPriorityList(
            before: SubstituteBindings::class,
            prepend: EnsureStaffRole::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
