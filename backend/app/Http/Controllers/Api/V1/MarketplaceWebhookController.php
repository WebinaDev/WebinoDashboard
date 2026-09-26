<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceLog;
use App\Models\Order;
use App\Services\Marketplace\Basalam\BasalamAuth;
use App\Services\Marketplace\Basalam\BasalamCategories;
use App\Services\Marketplace\Basalam\BasalamEndpoints;
use App\Services\Marketplace\Basalam\BasalamOrders;
use App\Services\Marketplace\Basalam\BasalamRequestLog;
use App\Services\Marketplace\Basalam\BasalamSettings;
use App\Services\Marketplace\Basalam\BasalamWebhooks;
use App\Services\Marketplace\Digikala\DigikalaWebhooks;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use App\Services\Marketplace\MarketplaceSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Inbound marketplace webhooks and callbacks (public, tenant resolved by domain).
 */
class MarketplaceWebhookController extends Controller
{
    public function __construct(protected MarketplaceSettingsService $settings) {}

    protected function tid(Request $request): int
    {
        return (int) $request->attributes->get('public_tenant_id');
    }

    /** Digikala Open API webhook; `X-Digikala-Signature` = HMAC-SHA256(body, webhook_secret) when a secret is set. */
    public function digikala(Request $request, DigikalaWebhooks $webhooks): JsonResponse
    {
        $tid = $this->tid($request);
        $body = (string) $request->getContent();
        $data = json_decode($body, true);
        if (! is_array($data)) {
            return response()->json(['ok' => false, 'message' => 'invalid payload'], 400);
        }
        if (! $this->settings->isEnabled($tid, 'digikala')) {
            return response()->json(['ok' => false, 'message' => __('marketplace.platform_disabled')], 403);
        }
        $secret = (string) ($this->settings->credentials($tid, 'digikala')['webhook_secret'] ?? '');
        if ($secret !== '') {
            $given = strtolower(trim((string) $request->header('X-Digikala-Signature', '')));
            if (str_starts_with($given, 'sha256=')) {
                $given = substr($given, 7);
            }
            if (! hash_equals(hash_hmac('sha256', $body, $secret), $given)) {
                MarketplaceLogger::warning($tid, 'digikala', 'webhook', 'Invalid webhook signature');

                return response()->json(['ok' => false, 'message' => 'invalid signature'], 403);
            }
        }
        $result = $webhooks->dispatch($tid, (string) ($data['event'] ?? ''), $data);

        return response()->json(['ok' => true, 'event' => $result['event'], 'queued' => $result['queued']]);
    }

    /** Basalam order webhook (`token` header = our webhook token); events are queued as `bs_order_event`. */
    public function basalam(Request $request, MarketplaceSync $sync): JsonResponse
    {
        $tid = $this->tid($request);
        if (! $this->settings->isEnabled($tid, 'basalam')) {
            return response()->json(['message' => __('marketplace.platform_disabled')], 403);
        }
        $webhooks = BasalamWebhooks::for($tid);
        if (! $webhooks->verifyToken($request->header('token'))) {
            try {
                if ($webhooks->canRegister()) {
                    $webhooks->setup();
                }
            } catch (Throwable $e) {
                MarketplaceLogger::warning($tid, 'basalam', 'webhook', 'Webhook re-setup failed: '.$e->getMessage());
            }
            MarketplaceLogger::error($tid, 'basalam', 'webhook', 'توکن وب‌هوک نامعتبر است.');

            return response()->json(['message' => 'Invalid token.'], 403);
        }

        $params = $request->json()->all() ?: $request->all();
        if (! app(BasalamSettings::class)->engine($tid)['sync_status_order']) {
            return response()->json(['message' => 'Order sync is disabled.']);
        }
        $sync->enqueue($tid, 'basalam', BasalamOrders::JOB_EVENT, (array) $params, 3, 0, 'bs_order_event:'.md5(json_encode($params)));

        return response()->json(['message' => 'Order event queued.']);
    }

    /** Support/diagnostics endpoint (WP InformationEndpoint): token via `token` header, Bearer or `?token`. */
    public function basalamStatus(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $token = trim((string) ($request->header('token') ?: ''));
        if ($token === '' && ($auth = (string) $request->header('Authorization', '')) !== '') {
            $token = stripos($auth, 'Bearer ') === 0 ? trim(substr($auth, 7)) : trim($auth);
        }
        if ($token === '') {
            $token = trim((string) $request->query('token', ''));
        }
        if ($token === '') {
            return response()->json(['code' => 'webino_basalam_missing_status_token', 'message' => 'Token is required.'], 403);
        }
        if (! BasalamWebhooks::for($tid)->verifyToken($token) && ! $this->validateHamsalamToken($token)) {
            return response()->json(['code' => 'webino_basalam_invalid_status_token', 'message' => 'توکن معتبر نیست.'], 403);
        }

        $engine = app(BasalamSettings::class)->engine($tid);
        $logs = fn (string $level) => MarketplaceLog::query()->where('tenant_id', $tid)->where('platform', 'basalam')
            ->where('level', $level)->latest('id')->limit(10)->get()
            ->map(fn (MarketplaceLog $l) => ['date' => $l->created_at?->toIso8601String(), 'level' => $l->level, 'message' => $l->message, 'context' => $l->meta])->all();

        return response()->json([
            'domain' => BasalamAuth::siteUrl($tid),
            'basalam_version' => (string) config('app.version', '1.0.0'),
            'wordpress_version' => null,
            'woocommerce_version' => null,
            'platform' => 'webino',
            'connection_status' => BasalamAuth::for($tid)->token() !== '',
            'settings' => array_filter($engine, fn ($k) => stripos((string) $k, 'token') === false, ARRAY_FILTER_USE_KEY),
            'request_status' => BasalamRequestLog::summary($tid),
            'last_10_log' => ['info' => $logs('info'), 'error' => $logs('error')],
            'category_mapping_list' => BasalamCategories::for($tid)->mappings(),
        ]);
    }

    protected function validateHamsalamToken(string $token): bool
    {
        return Cache::remember('marketplace:basalam:status-token:'.hash('sha256', $token), 600, function () use ($token) {
            try {
                $res = Http::timeout(15)->acceptJson()->get(BasalamEndpoints::STATUS_TOKEN_VALIDATION, ['token' => $token]);

                return $res->successful() && (bool) data_get($res->json(), 'success', true) !== false;
            } catch (Throwable) {
                return false;
            }
        });
    }

    /** ERP OAuth handoff landing: stores tokens then redirects to the panel. */
    public function basalamOAuthCallback(Request $request): RedirectResponse
    {
        $tid = $this->tid($request);
        $auth = BasalamAuth::for($tid);
        $fallback = $auth->safeReturnUrl('');
        try {
            $result = $auth->completeHandoff($request->all(), true);
            $url = $result['return_url'] ?: $fallback;

            return redirect()->away($url.(str_contains($url, '?') ? '&' : '?').'oauth=success');
        } catch (Throwable $e) {
            MarketplaceLogger::error($tid, 'basalam', 'auth', 'OAuth callback failed: '.$e->getMessage());

            return redirect()->away($fallback.(str_contains($fallback, '?') ? '&' : '?').'oauth=error&reason='.rawurlencode($e->getMessage()));
        }
    }

    /** Basalam Pay return URL (marketplace alias of the payments callback). */
    public function basalamPayCallback(Request $request, int $order): RedirectResponse
    {
        $model = Order::query()->where('tenant_id', $this->tid($request))->findOrFail($order);

        return app(PaymentCallbackController::class)->handleBasalamPay($request, $model);
    }
}
