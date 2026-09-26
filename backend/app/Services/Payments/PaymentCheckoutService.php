<?php

namespace App\Services\Payments;

use App\Models\Order;
use App\Models\PaymentIntent;
use App\Models\Tenant;
use Illuminate\Support\Facades\Http;

/**
 * Checkout intents driven by tenant gateway settings + official provider APIs.
 */
class PaymentCheckoutService
{
    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected DigipayClient $digipay,
        protected BnplClient $bnpl,
    ) {}

    public function createIntent(Order $order, string $provider): PaymentIntent
    {
        $provider = str_replace('-', '_', strtolower($provider));
        $allowed = ['zarinpal', 'digipay', 'snapppay', 'torobpay'];
        if (! in_array($provider, $allowed, true)) {
            throw new \InvalidArgumentException('Unsupported payment provider: '.$provider);
        }

        $tid = (int) $order->tenant_id;
        if (! $this->gateways->isEnabled($tid, $provider)) {
            throw new \RuntimeException('Payment gateway is disabled.');
        }
        if (! $this->gateways->configured($tid, $provider)) {
            throw new \RuntimeException('Payment gateway is not configured.');
        }

        $callbackUrl = url('/api/v1/payments/callback/'.$provider.'/'.$order->id);
        $settings = $this->gateways->getRaw($tid, $provider);
        $amountRial = $this->amountInRials($order);

        return match ($provider) {
            'zarinpal' => $this->createZarinpalIntent($order, $settings, $callbackUrl, $amountRial),
            'digipay' => $this->createDigipayIntent($order, $settings, $callbackUrl, $amountRial),
            'snapppay' => $this->createBnplIntent($order, $settings, $callbackUrl, $amountRial, 'snapppay'),
            'torobpay' => $this->createBnplIntent($order, $settings, $callbackUrl, $amountRial, 'torobpay'),
            default => throw new \InvalidArgumentException('Unsupported provider'),
        };
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createZarinpalIntent(Order $order, array $settings, string $callbackUrl, int $amountRial): PaymentIntent
    {
        $merchantId = (string) ($settings['merchant_id'] ?? '');
        $sandbox = (bool) ($settings['sandbox'] ?? true);
        $requestUrl = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/request.json';

        $currency = $this->storeCurrencyCode($order);
        $payload = [
            'merchant_id' => $merchantId,
            'amount' => $currency === 'IRT' ? (int) max(1, round($amountRial / 10)) : $amountRial,
            'currency' => $currency,
            'callback_url' => $callbackUrl,
            'description' => str_replace(
                '{order_id}',
                (string) $order->id,
                (string) ($settings['payment_description'] ?? 'Order #'.$order->id)
            ),
            'metadata' => array_filter([
                'order_id' => (string) $order->id,
                'mobile' => $order->customer_phone ?: null,
                'email' => $order->customer_email ?: null,
            ]),
        ];

        $response = Http::timeout(30)->acceptJson()->asJson()->post($requestUrl, $payload)->json();
        $code = (int) data_get($response, 'data.code');
        if ($code !== 100) {
            $msg = data_get($response, 'errors.message') ?? data_get($response, 'data.message') ?? json_encode($response);
            throw new \RuntimeException('Zarinpal request failed: '.$msg);
        }

        $authority = (string) data_get($response, 'data.authority');
        $startPay = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/StartPay/'.$authority
            : 'https://www.zarinpal.com/pg/StartPay/'.$authority;

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => 'zarinpal',
            'status' => 'created',
            'redirect_url' => $startPay,
            'meta' => [
                'stub' => false,
                'zarinpal_authority' => $authority,
                'amount_rial' => $amountRial,
                'currency' => $currency,
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createDigipayIntent(Order $order, array $settings, string $callbackUrl, int $amountRial): PaymentIntent
    {
        $token = $this->digipay->bearerToken($settings);
        if ($token === null) {
            throw new \RuntimeException('Digipay OAuth failed — check credentials.');
        }

        $base = $this->digipay->baseUrl($settings);
        $cell = preg_replace('/\D+/', '', (string) ($order->customer_phone ?? '')) ?: '';
        if ($cell === '') {
            throw new \RuntimeException('Digipay requires customer phone (cellNumber).');
        }
        if (str_starts_with($cell, '98') && strlen($cell) === 12) {
            $cell = '0'.substr($cell, 2);
        }

        $providerId = (string) $order->id;
        $pref = (int) ($settings['preferred_gateway'] ?? 2);
        $body = [
            'cellNumber' => $cell,
            'amount' => $amountRial,
            'providerId' => $providerId,
            'callbackUrl' => $callbackUrl,
            'additionalInfo' => [
                'preferredGateway' => $pref,
            ],
        ];

        $response = Http::timeout(30)
            ->withHeaders([
                'Agent' => 'WEB',
                'Digipay-Version' => $this->digipay->version($settings),
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
            ])
            ->post($base.'/tickets/business?type=11', $body)
            ->json();

        if ((int) data_get($response, 'result.status') !== 0) {
            throw new \RuntimeException(
                'Digipay ticket failed: '.(string) data_get($response, 'result.message', json_encode($response))
            );
        }

        $redirectUrl = data_get($response, 'redirectUrl');
        if (! is_string($redirectUrl) || $redirectUrl === '') {
            throw new \RuntimeException('Digipay response missing redirectUrl.');
        }

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => 'digipay',
            'status' => 'created',
            'redirect_url' => $redirectUrl,
            'meta' => [
                'stub' => false,
                'digipay_ticket' => data_get($response, 'ticket'),
                'provider_id' => $providerId,
                'amount_rial' => $amountRial,
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    protected function createBnplIntent(
        Order $order,
        array $settings,
        string $callbackUrl,
        int $amountRial,
        string $provider,
    ): PaymentIntent {
        $cart = $this->cartList($order->loadMissing('items'), $amountRial);
        $body = [
            'amount' => $amountRial,
            'cartList' => $cart,
            'paymentMethodTypeDto' => 'ONLINE_CREDIT',
            'returnURL' => $callbackUrl,
            'transactionId' => (string) $order->id,
            'mobile' => $order->customer_phone ?: null,
        ];
        if (! empty($settings['mobile_enabled']) && empty($body['mobile'])) {
            throw new \RuntimeException(ucfirst($provider).' requires customer mobile.');
        }

        $result = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/token', array_filter($body));
        if (! $result['ok']) {
            throw new \RuntimeException(ucfirst($provider).' token failed: '.($result['message'] ?: json_encode($result['data'])));
        }

        $paymentToken = (string) (data_get($result['data'], 'response.paymentToken')
            ?? data_get($result['data'], 'paymentToken')
            ?? '');
        $pageUrl = (string) (data_get($result['data'], 'response.paymentPageUrl')
            ?? data_get($result['data'], 'paymentPageUrl')
            ?? '');
        if ($paymentToken === '' || $pageUrl === '') {
            throw new \RuntimeException(ucfirst($provider).' response missing paymentToken/pageUrl.');
        }

        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => $provider,
            'status' => 'created',
            'redirect_url' => $pageUrl,
            'meta' => [
                'stub' => false,
                'payment_token' => $paymentToken,
                'amount_rial' => $amountRial,
            ],
        ]);
    }

    protected function amountInRials(Order $order): int
    {
        $minor = (int) $order->total_minor;
        $currency = $this->storeCurrencyCode($order);
        // Store amounts are in minor units of the store currency.
        // IRT (toman): convert to rial ×10 for Digipay/BNPL; Zarinpal uses currency field.
        if ($currency === 'IRT') {
            return max(1, $minor * 10);
        }

        return max(1, $minor);
    }

    protected function storeCurrencyCode(Order $order): string
    {
        $code = strtoupper((string) ($order->currency ?: ''));
        if (in_array($code, ['IRT', 'IRR'], true)) {
            return $code;
        }
        $tenant = Tenant::query()->find($order->tenant_id);
        $fromTenant = strtoupper((string) ($tenant?->default_currency ?? 'IRT'));

        return in_array($fromTenant, ['IRT', 'IRR'], true) ? $fromTenant : 'IRT';
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function cartList(Order $order, int $amountRial): array
    {
        $items = [];
        foreach ($order->items ?? [] as $line) {
            $qty = max(1, (int) ($line->quantity ?? 1));
            $unit = (int) ($line->unit_price_minor ?? 0);
            $currency = $this->storeCurrencyCode($order);
            $unitRial = $currency === 'IRT' ? $unit * 10 : $unit;
            $items[] = [
                'count' => $qty,
                'amount' => max(1, $unitRial),
                'category' => 'GENERAL',
                'id' => (string) ($line->product_id ?? $line->id ?? 'item'),
                'name' => (string) ($line->product_name ?? 'Item'),
            ];
        }
        if ($items === []) {
            $items[] = [
                'count' => 1,
                'amount' => $amountRial,
                'category' => 'GENERAL',
                'id' => (string) $order->id,
                'name' => 'Order #'.$order->id,
            ];
        }

        return $items;
    }
}
