<?php

namespace App\Services\Marketplace\Adapters;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Marketplace\FeedCatalog;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Torob: product feeds (legacy + v3), inbound token validation, order-status/orders/actions,
 * product page webhook and health checks. Port of the WNC Torob module.
 */
class TorobAdapter extends FeedAdapter
{
    public const PUBLIC_KEY = 't6Mu4T0pBORY11W+QeM35UsmLO3vsf+6yKpFDEImFk0=';

    public const VALIDATE_URL = 'https://extractor.torob.com/validate_token/';

    public const WEBHOOK_URL = 'https://api.torob.com/update/webhook/v1/';

    public const EXTRACTOR_HEALTH = 'https://extractor.torob.com/health_check/';

    public const BACKEND_HEALTH = 'https://api.torob.com/update/health_check/';

    public const LEGACY_API_VERSION = 'torob_woocommerce_products_v1';

    public const LOOKBACK_DAYS = 45;

    public const CLID_PATTERN = '/^[A-Za-z0-9_-]{1,128}$/';

    /** Public key override used by tests. */
    public static ?string $publicKeyOverride = null;

    public function platform(): string
    {
        return 'torob';
    }

    public function authUrl(): string
    {
        return self::VALIDATE_URL;
    }

    protected function probeBody(): array
    {
        return ['token' => 'webino-connectivity-probe', 'shop_domain' => $this->catalog()->siteDomain()];
    }

    public function expand(): bool
    {
        return (bool) ($this->credentials()['expand_variations'] ?? true);
    }

    public function option(string $key): bool
    {
        return (bool) ($this->credentials()[$key] ?? false);
    }

    public function testConnection(): array
    {
        $extractor = $this->health(self::EXTRACTOR_HEALTH);
        $backend = $this->health(self::BACKEND_HEALTH);
        $state = $this->state();

        return [
            'ok' => $extractor['ok'] && $backend['ok'],
            'message' => $extractor['ok'] && $backend['ok'] ? __('marketplace.torob_health_ok') : __('marketplace.torob_health_failed'),
            'details' => [
                'extractor' => $extractor,
                'backend' => $backend,
                'has_webhook_token' => filled($this->credentials()['webhook_token'] ?? null),
                'token_set_at' => $state['token_set_at'] ?? null,
                'domain' => $this->catalog()->siteDomain(),
            ],
        ];
    }

    /** @return array{ok: bool, status: int, time: float, error?: string} */
    public function health(string $url): array
    {
        $start = microtime(true);
        try {
            $res = Http::timeout(12)->withoutRedirecting()->get($url);
            $ok = $res->status() === 200;

            return ['ok' => $ok, 'status' => $res->status(), 'time' => round(microtime(true) - $start, 3)];
        } catch (ConnectionException $e) {
            return ['ok' => false, 'status' => 0, 'time' => round(microtime(true) - $start, 3), 'error' => $e->getMessage()];
        }
    }

    // ── Inbound auth ────────────────────────────────────────────────────

    /**
     * Validate X-Torob-Token / X-Torob-Token-Version headers.
     *
     * @return array{ok: bool, status: int, code?: string, message?: string, current_server_time?: string}
     */
    public function validateRequestToken(?string $token, ?string $version): array
    {
        $token = self::sanitizeOpaque($token);
        $version = self::sanitizeOpaque($version);
        if ($token === null || $token === '') {
            return ['ok' => false, 'status' => 401, 'code' => 'missing_token', 'message' => 'X-Torob-Token header is required'];
        }
        if ($version === null || $version === '') {
            return ['ok' => false, 'status' => 401, 'code' => 'missing_token', 'message' => 'X-Torob-Token-Version header is required'];
        }
        if ($version === '1' && function_exists('sodium_crypto_sign_verify_detached')) {
            return $this->validateJwt($token);
        }

        return $this->validateRemote($token, $version);
    }

    public static function sanitizeOpaque(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        return preg_replace('/[\x00-\x1F\x7F]/', '', trim($value));
    }

    /** @return array{ok: bool, status: int, code?: string, message?: string, current_server_time?: string} */
    public function validateJwt(string $jwt): array
    {
        $now = now('Asia/Tehran')->toAtomString();
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return ['ok' => false, 'status' => 401, 'code' => 'invalid_token', 'message' => 'Wrong number of segments'];
        }
        [$h64, $p64, $s64] = $parts;
        $header = json_decode((string) self::b64url($h64), true);
        $payload = json_decode((string) self::b64url($p64), true);
        $sig = self::b64url($s64);
        if (! is_array($header) || ! is_array($payload) || $sig === false) {
            return ['ok' => false, 'status' => 401, 'code' => 'invalid_token', 'message' => 'Malformed token'];
        }
        if (($header['alg'] ?? null) !== 'EdDSA') {
            return ['ok' => false, 'status' => 401, 'code' => 'invalid_token', 'message' => 'Incorrect key for this algorithm'];
        }
        $key = base64_decode(self::$publicKeyOverride ?? self::PUBLIC_KEY, true);
        try {
            $valid = $key !== false && strlen($sig) === SODIUM_CRYPTO_SIGN_BYTES
                && sodium_crypto_sign_verify_detached($sig, $h64.'.'.$p64, $key);
        } catch (\SodiumException) {
            $valid = false;
        }
        if (! $valid) {
            return ['ok' => false, 'status' => 401, 'code' => 'invalid_token', 'message' => 'Signature verification failed'];
        }
        $t = time();
        if (isset($payload['nbf']) && is_numeric($payload['nbf']) && $payload['nbf'] > $t) {
            return ['ok' => false, 'status' => 401, 'code' => 'token_nbf', 'message' => 'Cannot handle token prior to '.date(DATE_ATOM, (int) $payload['nbf']), 'current_server_time' => $now];
        }
        if (isset($payload['iat']) && is_numeric($payload['iat']) && $payload['iat'] > $t) {
            return ['ok' => false, 'status' => 401, 'code' => 'token_nbf', 'message' => 'Cannot handle token prior to '.date(DATE_ATOM, (int) $payload['iat']), 'current_server_time' => $now];
        }
        if (isset($payload['exp']) && is_numeric($payload['exp']) && $t >= $payload['exp']) {
            return ['ok' => false, 'status' => 401, 'code' => 'token_expired', 'message' => 'Token has expired', 'current_server_time' => $now];
        }
        $aud = $payload['aud'] ?? null;
        if (! is_string($aud) || $aud !== $this->catalog()->siteDomain()) {
            return ['ok' => false, 'status' => 401, 'code' => 'token_invalid_aud', 'message' => 'Invalid audience'];
        }

        return ['ok' => true, 'status' => 200];
    }

    public static function b64url(string $v): string|false
    {
        $v = strtr($v, '-_', '+/');
        $pad = strlen($v) % 4;
        if ($pad) {
            $v .= str_repeat('=', 4 - $pad);
        }

        return base64_decode($v, true);
    }

    /** @return array{ok: bool, status: int, code?: string, message?: string} */
    public function validateRemote(string $token, string $version): array
    {
        $cacheKey = 'torob_tok_'.$this->tenantId.'_'.md5($token.'|'.$version);
        if (cache()->get($cacheKey)) {
            return ['ok' => true, 'status' => 200];
        }
        try {
            $res = Http::timeout(12)->withoutRedirecting()->asForm()->post(self::VALIDATE_URL, [
                'token' => $token,
                'shop_domain' => $this->catalog()->siteDomain(),
                'token_version' => $version,
            ]);
        } catch (ConnectionException $e) {
            $this->logError('auth', 'Torob validation connection failed: '.$e->getMessage());

            return ['ok' => false, 'status' => 500, 'code' => 'connection_failed', 'message' => 'Could not connect to the Torob validation service'];
        }
        if ($res->status() >= 500) {
            return ['ok' => false, 'status' => 500, 'code' => 'validation_service_error', 'message' => 'Torob validation service returned a server error'];
        }
        $body = $res->json();
        if (($body['success'] ?? false) !== true) {
            return ['ok' => false, 'status' => 401, 'code' => 'invalid_token', 'message' => (string) (data_get($body, 'error.message') ?? 'The provided Torob token is invalid')];
        }
        cache()->put($cacheKey, true, 300);

        return ['ok' => true, 'status' => 200];
    }

    public function setWebhookToken(string $token): void
    {
        $this->settings->patchCredentials($this->tenantId, 'torob', ['webhook_token' => $token]);
        $this->putState(['token_set_at' => now()->toAtomString()]);
        $this->logInfo('webhook', 'Torob webhook token set');
    }

    public function resetWebhookToken(): void
    {
        $this->settings->patchCredentials($this->tenantId, 'torob', ['webhook_token' => '']);
        $this->putState(['token_set_at' => null]);
    }

    // ── Feeds ───────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function metadata(): array
    {
        $c = $this->credentials();
        $state = $this->state();

        return [
            'wordpress_version' => null,
            'php_version' => PHP_VERSION,
            'plugin_version' => config('app.version', '1.0.0'),
            'woocommerce_version' => null,
            'beta_test_plugin_version' => null,
            'libsodium_version' => defined('SODIUM_LIBRARY_VERSION') ? SODIUM_LIBRARY_VERSION : null,
            'hpos_enabled' => true,
            'options' => [
                'order_status_enabled' => (bool) $c['order_status_enabled'],
                'orders_list_api_enabled' => (bool) $c['orders_list_api_enabled'],
                'product_page_webhook_enabled' => (bool) $c['product_page_webhook_enabled'],
                'action_tracking_enabled' => (bool) $c['action_tracking_enabled'],
                'has_torob_token' => filled($c['webhook_token'] ?? null),
                'torob_token_set_at' => $state['token_set_at'] ?? null,
            ],
        ];
    }

    /** Legacy (wcpe/v1) product object. */
    public function productPayload(Product $product, ?ProductVariant $variant, bool $expand): array
    {
        $c = $this->catalog();
        $prices = $c->prices($product, $variant, 'torob');
        $spec = $c->spec($product, $variant);
        $images = $c->images($product, $variant);

        return [
            'title' => $c->title($product, $variant, $expand),
            'subtitle' => (string) ($product->english_name ?? ''),
            'parent_id' => $variant ? $product->id : 0,
            'page_unique' => $c->pageUnique($product, $variant),
            'availability' => $c->stockStatus($product, $variant),
            'current_price' => $prices['current'],
            'old_price' => $prices['old'],
            'category_name' => $c->categoryName($product),
            'image_links' => $images,
            'image_link' => $images[0] ?? null,
            'page_url' => $c->productUrl($product, $variant),
            'short_desc' => $c->shortDesc($product),
            'spec' => $spec ? [$spec] : [],
            'date_added' => $product->created_at?->toAtomString(),
            'date_updated' => ($variant?->updated_at ?? $product->updated_at)?->toAtomString(),
            'product_type' => $variant ? 'variation' : ((string) ($product->type ?: 'simple')),
            'guarantee' => $c->pickSpec($spec, FeedCatalog::GUARANTEE_KEYS),
        ];
    }

    /** Product API v3 row. */
    public function productPayloadV3(Product $product, ?ProductVariant $variant, bool $expand): array
    {
        $c = $this->catalog();
        $legacy = $this->productPayload($product, $variant, $expand);
        $available = $c->inStock($product, $variant);
        $current = $available ? (int) $legacy['current_price'] : 0;
        $old = (int) $legacy['old_price'];
        $spec = $legacy['spec'][0] ?? [];

        $row = [
            'page_unique' => (string) $legacy['page_unique'],
            'page_url' => (string) $legacy['page_url'],
            'title' => mb_substr((string) $legacy['title'], 0, 500),
            'current_price' => $current,
            'availability' => $available,
            'image_links' => $legacy['image_links'],
            'spec' => (object) $spec,
            'date_added' => $legacy['date_added'] ?? now()->toAtomString(),
        ];
        if ($legacy['subtitle'] !== '') {
            $row['subtitle'] = mb_substr($legacy['subtitle'], 0, 500);
        }
        if ($variant) {
            $row['product_group_id'] = (string) $product->id;
        }
        if ($old > 0 && $old !== $current) {
            $row['old_price'] = $old;
        }
        if ($legacy['category_name'] !== '') {
            $row['category_name'] = mb_substr($legacy['category_name'], 0, 200);
        }
        if ($legacy['short_desc'] !== '') {
            $row['short_desc'] = mb_substr($legacy['short_desc'], 0, 500);
        }
        if ($legacy['guarantee'] !== '') {
            $row['guarantee'] = mb_substr($legacy['guarantee'], 0, 200);
        }
        if (! empty($legacy['date_updated'])) {
            $row['date_updated'] = $legacy['date_updated'];
        }

        return $row;
    }

    // ── Order status / orders / actions ─────────────────────────────────

    public static function torobStatus(Order $order): string
    {
        $paid = (int) ($order->amount_paid_minor ?? 0) > 0 || in_array($order->status, \App\Services\Reports\OrderReports::salesStatuses(), true);

        return match ($order->status) {
            'pending_payment', 'awaiting_gateway', 'payment_failed' => 'WAITING_FOR_USER_PAYMENT',
            'on_hold' => 'WAITING_FOR_SHOP',
            'paid', 'processing' => 'PROCESSING',
            'shipped', 'completed' => 'SHIPPED',
            'cancelled' => $paid ? 'CANCELED_PAID' : 'CANCELED_UNPAID',
            'refunded' => 'CANCELED_PAID',
            'failed' => 'CANCELED_UNPAID',
            default => (string) $order->status,
        };
    }

    public static function explanation(Order $order, string $status): string
    {
        $m = (array) (($order->meta ?? [])['torob'] ?? []);
        $g = fn (string $k) => trim((string) ($m[$k] ?? ''));
        $text = '';
        switch ($status) {
            case 'SHIPPED':
                $text = 'سفارش شما با موفقیت ارسال شده است.';
                $code = $g('tracking_code') ?: (string) ($order->tracking_code ?? '');
                if ($code !== '') {
                    $text .= ' کد رهگیری: '.$code;
                }
                if ($g('carrier') !== '') {
                    $text .= '، کالارسان: '.$g('carrier');
                }
                if ($g('shipping_date') !== '') {
                    $text .= '. تاریخ ارسال: '.$g('shipping_date');
                }
                if ($g('tracking_url') !== '') {
                    $text .= '. برای پیگیری مرسوله می‌توانید از لینک زیر استفاده کنید: '.$g('tracking_url');
                }
                break;
            case 'PROCESSING':
                $text = 'سفارش شما در حال پردازش است.';
                if ($g('processing_stage') !== '') {
                    $text .= ' وضعیت فعلی: '.$g('processing_stage').'.';
                }
                if ($g('estimated_shipping_date') !== '') {
                    $text .= ' تاریخ تخمینی ارسال: '.$g('estimated_shipping_date').'.';
                }
                break;
            case 'WAITING_FOR_USER_PAYMENT':
                $text = $g('payment_deadline') ?: 'در انتظار پرداخت شما. لطفا برای تکمیل سفارش، مبلغ را پرداخت کنید.';
                break;
            case 'WAITING_FOR_SHOP':
                $text = $g('review_stage') ?: 'سفارش شما در حال بررسی توسط فروشگاه است. پس از تایید، به مرحله پردازش می‌رود.';
                break;
            case 'CANCELED_UNPAID':
                $text = trim($g('cancel_reason').' '.$g('payment_note')) ?: 'سفارش لغو شده است. پرداختی انجام نشده بود.';
                break;
            case 'CANCELED_PAID':
                $text = $g('cancel_reason');
                if ($g('refund_status') !== '') {
                    $text = trim($text.' وضعیت بازگشت وجه: '.$g('refund_status'));
                }
                $text = $text ?: 'سفارش لغو شده است. در صورت پرداخت، مبلغ به حساب شما برگردانده خواهد شد.';
                break;
            default:
                $text = 'وضعیت سفارش در حال بررسی است.';
        }
        foreach (['status_explanation', 'custom_explanation'] as $k) {
            if ($g($k) !== '') {
                $text .= ' '.$g($k);
            }
        }

        return $text;
    }

    public static function normalizePhone(string $phone): ?string
    {
        $phone = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($phone, '00989')) {
            $phone = substr($phone, 4);
        } elseif (str_starts_with($phone, '989')) {
            $phone = substr($phone, 2);
        }
        if (preg_match('/^9\d{9}$/', $phone)) {
            $phone = '0'.$phone;
        }

        return preg_match('/^09\d{9}$/', $phone) ? $phone : null;
    }

    public static function parseIso(string $ts): int|false
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/', $ts)) {
            return false;
        }
        $format = str_contains($ts, '.') ? 'Y-m-d\TH:i:s.u\Z' : 'Y-m-d\TH:i:s\Z';
        $d = \DateTimeImmutable::createFromFormat($format, $ts, new \DateTimeZone('UTC'));
        if (! $d) {
            return false;
        }
        $errors = \DateTimeImmutable::getLastErrors();
        if ($errors && ($errors['warning_count'] || $errors['error_count'])) {
            return false;
        }

        return $d->getTimestamp();
    }

    public static function formatIso(int $ts): string
    {
        return (new \DateTime('@'.$ts))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z');
    }

    public static function lookback(int $ts): int
    {
        return max($ts, time() - self::LOOKBACK_DAYS * 86400);
    }

    /** @return \Illuminate\Support\Collection<int, Order> */
    public function trackedOrders(int $since, int $limit)
    {
        $date = date('Y-m-d H:i:s', $since);

        return Order::query()
            ->where('tenant_id', $this->tenantId)
            ->whereNotNull('meta->torob_clid')
            ->whereIn('status', ['completed', 'shipped', 'processing', 'paid', 'on_hold', 'cancelled', 'refunded', 'failed'])
            ->where(fn ($q) => $q->where('created_at', '>', $date)->orWhere('updated_at', '>', $date))
            ->with('items.product')
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit($limit)
            ->get()
            ->filter(fn (Order $o) => filled(($o->meta ?? [])['torob_clid'] ?? null))
            ->values();
    }

    /** @return array<string, mixed>|null */
    public function formatTrackedOrder(Order $order): ?array
    {
        $clid = ($order->meta ?? [])['torob_clid'] ?? null;
        if (! $clid) {
            return null;
        }
        $pricing = $this->catalog()->pricing();
        $toToman = fn (int $amount) => (int) round($pricing->toRial($amount, $order->currency) / 10);
        $products = [];
        $value = 0;
        foreach ($order->items as $item) {
            $line = (int) $item->unit_price_minor * (int) $item->quantity;
            $value += $toToman($line);
            if ($item->product) {
                $products[] = [
                    'product_url' => $this->catalog()->productUrl($item->product),
                    'product_price' => $toToman((int) $item->unit_price_minor),
                    'quantity' => (int) $item->quantity,
                ];
            }
        }
        $created = $order->created_at?->timestamp ?? time();
        $updated = max($created, $order->updated_at?->timestamp ?? $created);
        $tender = (string) ($order->payment_tender ?? '');

        return [
            'purchase_timestamp' => self::formatIso($created),
            'torob_clid' => (string) $clid,
            'psp' => $order->payment_provider === 'torobpay' ? 'torobpay' : (in_array($tender, ['cash', 'card_to_card'], true) ? 'card' : ($order->payment_provider ?: $tender)),
            'order_value' => $value,
            'shipping_amount' => $toToman((int) $order->shipping_minor),
            'status' => in_array($order->status, ['cancelled', 'refunded', 'failed'], true) ? 'cancelled' : 'completed',
            'last_updated_timestamp' => self::formatIso($updated),
            'phone_number' => $order->customer_phone ? self::normalizePhone((string) $order->customer_phone) : null,
            'products' => $products,
        ];
    }

    public static function sanitizeClid(?string $clid): ?string
    {
        $clid = trim((string) $clid);

        return preg_match(self::CLID_PATTERN, $clid) ? $clid : null;
    }
}
