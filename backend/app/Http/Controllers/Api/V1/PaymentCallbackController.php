<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Payments\BnplClient;
use App\Services\Payments\DigipayClient;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Orders\OrderStatusService;
use App\Services\Shop\LoyaltyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Browser redirects from payment providers (no Sanctum session).
 */
class PaymentCallbackController extends Controller
{
    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected DigipayClient $digipay,
        protected BnplClient $bnpl,
        protected LoyaltyService $loyalty,
        protected OrderStatusService $statuses,
    ) {}

    public function handle(Request $request, string $provider, Order $order): RedirectResponse
    {
        $provider = str_replace('-', '_', strtolower($provider));

        return match ($provider) {
            'zarinpal' => $this->handleZarinpal($request, $order),
            'digipay' => $this->handleDigipay($request, $order),
            'snapppay' => $this->handleBnpl($request, $order, 'snapppay', true),
            'torobpay' => $this->handleBnpl($request, $order, 'torobpay', false),
            BasalamPay::PROVIDER => $this->handleBasalamPay($request, $order),
            default => $this->finish(false),
        };
    }

    public function handleBasalamPay(Request $request, Order $order): RedirectResponse
    {
        try {
            $hash = (string) ($request->input('hash_id') ?? $request->input('hash') ?? '');
            $result = BasalamPay::for((int) $order->tenant_id)->verify($order, $hash);

            return $this->finish($result['paid'], $order);
        } catch (\Throwable $e) {
            MarketplaceLogger::error((int) $order->tenant_id, 'basalam', 'pay', 'Basalam Pay verify failed: '.$e->getMessage(), ['order_id' => $order->id]);

            return $this->finish(false);
        }
    }

    protected function handleZarinpal(Request $request, Order $order): RedirectResponse
    {
        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'zarinpal');
        $merchantId = (string) ($settings['merchant_id'] ?? '');
        $sandbox = (bool) ($settings['sandbox'] ?? true);
        $authority = $request->query('Authority');
        $status = $request->query('Status');

        $intent = PaymentIntent::query()
            ->where('order_id', $order->id)
            ->where('provider', 'zarinpal')
            ->latest()
            ->first();

        if ($merchantId === '' || ! $authority || $status !== 'OK') {
            $this->markFailed($order);

            return $this->finish(false);
        }

        $currency = strtoupper((string) (data_get($intent?->meta, 'currency') ?: $order->currency ?: 'IRT'));
        $amountRial = (int) (data_get($intent?->meta, 'amount_rial') ?: $order->total_minor);
        $verifyAmount = $currency === 'IRT'
            ? (int) max(1, round($amountRial / 10))
            : $amountRial;

        $verifyHost = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';

        $verify = Http::timeout(30)->acceptJson()->asJson()->post($verifyHost, [
            'merchant_id' => $merchantId,
            'authority' => $authority,
            'amount' => $verifyAmount,
        ])->json();

        $code = (int) data_get($verify, 'data.code');
        if ($code === 100 || $code === 101) {
            $refId = data_get($verify, 'data.ref_id');
            $this->markPaid($order, [
                'payment_ref' => $refId !== null ? (string) $refId : null,
                'payment_provider' => 'zarinpal',
            ]);
            $intent?->update(['status' => 'completed']);

            return $this->finish(true, $order);
        }

        $this->markFailed($order);

        return $this->finish(false);
    }

    protected function handleDigipay(Request $request, Order $order): RedirectResponse
    {
        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'digipay');
        $trackingCode = $request->query('trackingCode') ?? $request->query('tracking_code');
        $intent = PaymentIntent::query()
            ->where('order_id', $order->id)
            ->where('provider', 'digipay')
            ->latest()
            ->first();

        $token = $this->digipay->bearerToken($settings);
        $base = $this->digipay->baseUrl($settings);
        $providerId = (string) (data_get($intent?->meta, 'provider_id') ?: $order->id);

        if ($trackingCode === null || $trackingCode === '' || $token === null) {
            $this->markFailed($order);

            return $this->finish(false);
        }

        $verify = Http::timeout(30)
            ->withHeaders([
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
                'Digipay-Version' => $this->digipay->version($settings),
            ])
            ->post($base.'/purchases/verify?type=11', [
                'trackingCode' => $trackingCode,
                'providerId' => $providerId,
            ])
            ->json();

        if ((int) data_get($verify, 'result.status') === 0) {
            $this->markPaid($order, [
                'payment_ref' => is_scalar($trackingCode) ? (string) $trackingCode : null,
                'payment_provider' => 'digipay',
            ]);
            $intent?->update(['status' => 'completed']);

            return $this->finish(true, $order);
        }

        $this->markFailed($order);

        return $this->finish(false);
    }

    protected function handleBnpl(Request $request, Order $order, string $provider, bool $requireSettle): RedirectResponse
    {
        $settings = $this->gateways->getRaw((int) $order->tenant_id, $provider);
        $state = (string) ($request->query('state') ?? $request->query('Status') ?? '');
        $intent = PaymentIntent::query()
            ->where('order_id', $order->id)
            ->where('provider', $provider)
            ->latest()
            ->first();
        $paymentToken = (string) (
            $request->query('paymentToken')
            ?? data_get($intent?->meta, 'payment_token')
            ?? ''
        );

        if (strtoupper($state) !== 'OK' || $paymentToken === '') {
            $this->markFailed($order);

            return $this->finish(false);
        }

        $verify = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/verify', [
            'paymentToken' => $paymentToken,
        ]);
        if (! $verify['ok']) {
            $this->markFailed($order);

            return $this->finish(false);
        }

        $shouldSettle = $requireSettle || ! empty($settings['settle_enabled']);
        if ($shouldSettle) {
            $settle = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/settle', [
                'paymentToken' => $paymentToken,
            ]);
            if (! $settle['ok']) {
                $this->markFailed($order);

                return $this->finish(false);
            }
        }

        $this->markPaid($order, [
            'payment_ref' => $paymentToken,
            'payment_provider' => $provider,
        ]);
        $intent?->update(['status' => 'completed']);

        return $this->finish(true, $order);
    }

    /** @param  array<string, mixed>  $extra */
    protected function markPaid(Order $order, array $extra): void
    {
        $this->statuses->apply($order, 'paid', array_merge($extra, [
            'amount_paid_minor' => (int) $order->total_minor,
        ]));
    }

    protected function markFailed(Order $order): void
    {
        $this->statuses->apply($order, 'payment_failed');
    }

    protected function finish(bool $ok, ?Order $order = null): RedirectResponse
    {
        if ($ok && $order) {
            try {
                $this->loyalty->awardForPaidOrder($order->fresh());
            } catch (\Throwable) {
                // Loyalty must not block payment success redirect.
            }
        }
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return redirect()->away($base.'/checkout?payment='.($ok ? 'success' : 'failed'));
    }
}
