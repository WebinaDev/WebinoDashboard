<?php

use App\Http\Middleware\EnsureModuleEnabled;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);
        $middleware->encryptCookies(except: [
            env('AUTH_COOKIE_NAME', 'webino_auth_token'),
        ]);
        $middleware->api(prepend: [
            \App\Http\Middleware\ForceJsonResponse::class,
            \App\Http\Middleware\ApiResponseFormatter::class,
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
            \App\Http\Middleware\AuthenticateFromCookie::class,
        ]);
        $middleware->api(append: [
            \App\Http\Middleware\RequirePasswordChange::class,
            \App\Http\Middleware\RequireTwoFactor::class,
            \App\Http\Middleware\ThrottleApiToken::class,
        ]);
        $middleware->alias([
            'module' => EnsureModuleEnabled::class,
            'public.module' => \App\Http\Middleware\EnsurePublicModuleEnabled::class,
            'public.tenant' => \App\Http\Middleware\ResolvePublicTenant::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
