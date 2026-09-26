<?php

namespace App\Services\Marketplace\Basalam;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Tenant;
use App\Services\Marketplace\MarketplaceException;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Basalam App Store payment gateway (OpenAPI pay endpoints): pre-transaction → pay_url, then
 * inquiry (+ verify when "unverified") on the callback.
 */
class BasalamPay
{
    public const PROVIDER = 'basalam_pay';

    public const MIN_AMOUNT_RIAL = 10000;

    public function __construct(protected int $tenantId, protected BasalamSettings $settings) {}

    public static function for(int $tenantId): self
    {
        return new self($tenantId, app(BasalamSettings::class));
    }

    public function configured(): bool
    {
        $g = $this->settings->gateway($this->tenantId);

        return $g['gateway_sandbox'] || $g['gateway_secret'] !== '';
    }

    public function amountRial(Order $order): int
    {
        $minor = (int) $order->total_minor;
        $currency = strtoupper((string) ($order->currency ?: Tenant::query()->whereKey($order->tenant_id)->value('default_currency') ?: 'IRT'));
        $rial = $currency === 'IRR' ? $minor : $minor * 10;

        return max(self::MIN_AMOUNT_RIAL, $rial);
    }

    public static function callbackUrl(Order $order): string
    {
        return url('/api/v1/payments/callback/'.self::PROVIDER.'/'.$order->id);
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, array $body = []): array
    {
        $g = $this->settings->gateway($this->tenantId);
        $headers = ['Accept' => 'application/json'];
        if ($g['gateway_sandbox']) {
            $headers['x-sandbox'] = $g['gateway_sandbox_token'] !== '' ? $g['gateway_sandbox_token'] : 'demo-team-1';
        } else {
            if ($g['gateway_secret'] === '') {
                throw new MarketplaceException(__('marketplace.basalam_pay_secret_missing'), 400);
            }
            $headers['X-Gateway-Secret'] = $g['gateway_secret'];
        }
        $url = rtrim($g['pay_api_base'], '/').'/'.ltrim($path, '/');
        try {
            $pending = Http::timeout(30)->withHeaders($headers)->asJson();
            $response = strtoupper($method) === 'GET' ? $pending->get($url) : $pending->send(strtoupper($method), $url, $body ? ['json' => $body] : []);
        } catch (Throwable $e) {
            throw new MarketplaceException(__('marketplace.basalam_pay_failed', ['error' => $e->getMessage()]), 0);
        }
        $data = $response->json();
        if (! is_array($data)) {
            $data = ['raw' => $response->body()];
        }
        if (! $response->successful()) {
            throw new MarketplaceException(__('marketplace.basalam_pay_failed', ['error' => (string) ($data['message'] ?? $response->status())]), 502);
        }

        return $data;
    }

    /** Idempotent: reuses an open intent carrying hash_id + pay_url. */
    public function createIntent(Order $order): PaymentIntent
    {
        $existing = PaymentIntent::query()->where('order_id', $order->id)->where('provider', self::PROVIDER)
            ->where('status', 'created')->latest()->first();
        if ($existing && data_get($existing->meta, 'hash_id') && $existing->redirect_url) {
            return $existing;
        }

        $reference = 'WD-WC-'.$order->id.'-'.time();
        $amount = $this->amountRial($order);
        $res = $this->request('POST', '/v1/pay/pre-transactions', [
            'reference_id' => $reference,
            'amount' => $amount,
            'callback_url' => self::callbackUrl($order),
            'description' => __('marketplace.basalam_pay_description', ['id' => $order->id]),
        ]);
        $hash = trim((string) ($res['hash_id'] ?? ''));
        $pay = trim((string) ($res['pay_url'] ?? ''));
        if ($hash === '' || ! filter_var($pay, FILTER_VALIDATE_URL)) {
            throw new MarketplaceException(__('marketplace.basalam_pay_invalid'), 502);
        }

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => self::PROVIDER,
            'status' => 'created',
            'redirect_url' => $pay,
            'meta' => ['hash_id' => $hash, 'reference_id' => $reference, 'amount_rial' => $amount],
        ]);
    }

    /**
     * @return array{status: string, paid: bool, data: array<string, mixed>}
     */
    public function verify(Order $order, string $hash = ''): array
    {
        $intent = PaymentIntent::query()->where('order_id', $order->id)->where('provider', self::PROVIDER)->latest()->first();
        $hash = trim($hash) !== '' ? trim($hash) : (string) data_get($intent?->meta, 'hash_id', '');
        if ($hash === '') {
            throw new MarketplaceException(__('marketplace.basalam_pay_hash_missing'), 422);
        }

        $path = '/v1/pay/transactions/'.rawurlencode($hash);
        $data = $this->request('GET', $path.'/inquiry');
        $slug = strtolower((string) data_get($data, 'status.slug', ''));
        if ($slug === 'unverified') {
            $data = $this->request('POST', $path.'/verify');
            $slug = strtolower((string) data_get($data, 'status.slug', ''));
        }
        $slug = $slug !== '' ? $slug : 'pending';

        $meta = (array) ($intent?->meta ?? []);
        $meta['pay_status'] = $slug;
        if ($slug === 'success') {
            if ($order->status !== 'paid') {
                $order->update(['status' => 'paid', 'payment_ref' => $hash, 'payment_provider' => self::PROVIDER]);
            }
            $intent?->update(['status' => 'completed', 'meta' => $meta]);

            return ['status' => $slug, 'paid' => true, 'data' => $data];
        }
        if (in_array($slug, ['failed', 'refunded'], true)) {
            $order->update(['status' => 'payment_failed']);
            $intent?->update(['status' => 'failed', 'meta' => $meta]);

            return ['status' => $slug, 'paid' => false, 'data' => $data];
        }
        $intent?->update(['meta' => $meta]);

        return ['status' => $slug, 'paid' => false, 'data' => $data];
    }
}
