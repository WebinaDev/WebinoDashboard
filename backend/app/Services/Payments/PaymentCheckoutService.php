<?php

namespace App\Services\Payments;

use App\Models\Order;
use App\Models\PaymentIntent;
use Illuminate\Support\Facades\Http;

/**
 * Digipay / Zarinpal — uses sandbox/live HTTP APIs when credentials exist; otherwise stub meta.
 */
class PaymentCheckoutService
{
    public function __construct(
        protected DigipayClient $digipay,
    ) {}

    public function createIntent(Order $order, string $provider): PaymentIntent
    {
        $provider = in_array($provider, ['digipay', 'zarinpal'], true) ? $provider : 'zarinpal';

        $callbackUrl = url('/api/v1/payments/callback/'.$provider.'/'.$order->id);

        if ($provider === 'zarinpal' && $this->zarinpalConfigured()) {
            return $this->createZarinpalIntent($order, $callbackUrl);
        }

        if ($provider === 'digipay' && $this->digipayReady()) {
            return $this->createDigipayIntent($order, $callbackUrl);
        }

        return $this->createStubIntent($order, $provider, $callbackUrl);
    }

    protected function zarinpalConfigured(): bool
    {
        return (string) config('services.zarinpal.merchant_id') !== '';
    }

    /** Credentials present (OAuth not probed — avoids extra network on stub path). */
    protected function digipayReady(): bool
    {
        $cell = (string) config('services.digipay.cell_number');
        $pid = config('services.digipay.provider_id');

        return $cell !== ''
            && $pid !== null
            && (string) $pid !== '';
    }

    protected function createStubIntent(Order $order, string $provider, string $callbackUrl): PaymentIntent
    {
        return PaymentIntent::query()->create([
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'provider' => $provider,
            'status' => 'created',
            'redirect_url' => $callbackUrl,
            'meta' => [
                'stub' => true,
                'docs' => [
                    'digipay' => 'https://www.mydigipay.com/developers/docs/upg/',
                    'zarinpal' => 'https://www.zarinpal.com/docs/apiDocs/',
                ],
            ],
        ]);
    }

    protected function createZarinpalIntent(Order $order, string $callbackUrl): PaymentIntent
    {
        $merchantId = (string) config('services.zarinpal.merchant_id');
        $sandbox = (bool) config('services.zarinpal.sandbox', true);

        $requestUrl = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
            : 'https://api.zarinpal.com/pg/v4/payment/request.json';

        $payload = [
            'merchant_id' => $merchantId,
            'amount' => (int) $order->total_minor,
            'callback_url' => $callbackUrl,
            'description' => 'Order #'.$order->id,
        ];

        $response = Http::timeout(30)->post($requestUrl, $payload)->json();

        if (($response['data']['code'] ?? null) !== 100) {
            $msg = data_get($response, 'errors.message') ?? json_encode($response);
            throw new \RuntimeException('Zarinpal request failed: '.$msg);
        }

        $authority = $response['data']['authority'];
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
            ],
        ]);
    }

    protected function createDigipayIntent(Order $order, string $callbackUrl): PaymentIntent
    {
        $token = $this->digipay->bearerToken();
        if ($token === null) {
            throw new \RuntimeException('Digipay OAuth failed — check DIGIPAY_* credentials.');
        }

        $base = rtrim((string) config('services.digipay.base_url'), '/');
        $cell = (string) config('services.digipay.cell_number');
        $providerId = config('services.digipay.provider_id');
        $pref = (int) config('services.digipay.preferred_gateway', 0);

        $body = [
            'cellNumber' => $cell,
            'amount' => (int) $order->total_minor,
            'providerId' => is_numeric((string) $providerId) ? (int) $providerId : $providerId,
            'callbackUrl' => $callbackUrl,
            'additionalInfo' => [
                'preferredGateway' => $pref,
            ],
        ];

        $response = Http::timeout(30)
            ->withHeaders([
                'Agent' => 'WEB',
                'Digipay-Version' => '2022-02-02',
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
            ])
            ->post($base.'/tickets/business?type=11', $body)
            ->json();

        if (data_get($response, 'result.status') !== 0) {
            throw new \RuntimeException(
                'Digipay ticket failed: '.(string) data_get($response, 'result.message', json_encode($response))
            );
        }

        $redirectUrl = data_get($response, 'redirectUrl');
        $ticket = data_get($response, 'ticket');

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
                'digipay_ticket' => $ticket,
            ],
        ]);
    }
}
