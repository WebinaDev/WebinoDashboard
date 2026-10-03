<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\AuthCookie;
use App\Support\ImpersonationNextPath;
use App\Support\ImpersonationSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

class ImpersonationController extends Controller
{
    public function switch(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'provision_id' => ['required', 'integer', 'min:1'],
            'next' => ['nullable', 'string', 'max:200'],
        ]);

        $stored = ImpersonationSession::current($request);
        $passport = is_array($stored) && is_string($stored['passport'] ?? null) ? $stored['passport'] : '';
        if ($passport === '') {
            return response()->json(['message' => 'نشست جانشینی نامعتبر یا منقضی شده است. از ERP دوباره وارد شوید.'], 422);
        }

        $base = rtrim((string) config('services.webino.base_url'), '/');
        if ($base === '' || $this->erpHostBlocked($base)) {
            return response()->json(['message' => 'آدرس ERP برای جابه‌جایی سایت تنظیم نشده است.'], 503);
        }

        try {
            $response = Http::acceptJson()
                ->timeout(20)
                ->post($base.'/api/v1/site-builder/impersonate/exchange', [
                    'passport' => $passport,
                    'provision_id' => (int) $data['provision_id'],
                    'next' => ImpersonationNextPath::normalize($data['next'] ?? null),
                ]);
        } catch (Throwable) {
            return response()->json(['message' => 'ارتباط با ERP برای جابه‌جایی سایت برقرار نشد.'], 503);
        }

        if (! $response->successful()) {
            $message = $response->json('message');

            return response()->json([
                'message' => is_string($message) && $message !== ''
                    ? $message
                    : 'جابه‌جایی به سایت دیگر ناموفق بود.',
            ], 422);
        }

        $url = $response->json('data.url');
        if (! is_string($url) || ! $this->safeLoginUrl($url)) {
            return response()->json(['message' => 'لینک ورود سایت مقصد معتبر نیست.'], 422);
        }

        return response()->json(['data' => ['url' => $url]]);
    }

    public function exit(Request $request): \Illuminate\Http\JsonResponse
    {
        $stored = ImpersonationSession::current($request);
        if (! is_array($stored)) {
            return response()->json(['message' => 'نشست جانشینی فعال نیست.'], 422);
        }

        $returnUrl = is_string($stored['return_url'] ?? null) ? $stored['return_url'] : null;
        ImpersonationSession::revokeRemote($stored);
        ImpersonationSession::forget($request);
        $request->user()?->currentAccessToken()?->delete();

        return AuthCookie::clear(response()->json([
            'data' => [
                'return_url' => $returnUrl,
            ],
        ]), $request);
    }

    private function erpHostBlocked(string $base): bool
    {
        $host = strtolower((string) parse_url($base, PHP_URL_HOST));

        return $host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    }

    private function safeLoginUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (! is_array($parts)) {
            return false;
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');
        $path = (string) ($parts['path'] ?? '');
        if ($host === '' || ($path !== '/login' && ! str_ends_with($path, '/login'))) {
            return false;
        }
        if ($scheme === 'https') {
            return true;
        }

        return $scheme === 'http' && ! app()->environment('production');
    }
}
