<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Marketplace\Basalam\BasalamPay;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Orders\OrderStatusService;
use App\Services\Payments\BnplClient;
use App\Services\Payments\DigipayClient;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shop\LoyaltyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Browser redirects from payment providers (no Sanctum session).
 *
 * Paid is recorded only after the provider verify call succeeds for the
 * authority or token stored on this order's intent. A bare GET, a crawler,
 * or another order's authority does not change status.
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

        if ($order->status === 'paid') {
            return $this->finish(true, $order);
        }

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
        $authority = (string) $request->query('Authority', '');
        $status = strtoupper((string) $request->query('Status', ''));
        $intent = $this->intentMatching($order, 'zarinpal', 'zarinpal_authority', $authority);

        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false);
        }

        if ($status !== 'OK') {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'zarinpal');
        $merchantId = (string) ($settings['merchant_id'] ?? '');
        $amountRial = (int) data_get($intent->meta, 'amount_rial', 0);
        if ($merchantId === '' || $amountRial < 1) {
            return $this->finish(false);
        }

        $currency = strtoupper((string) (data_get($intent->meta, 'currency') ?: $order->currency ?: 'IRT'));
        $verifyAmount = $currency === 'IRT'
            ? (int) max(1, round($amountRial / 10))
            : $amountRial;
        $sandbox = (bool) ($settings['sandbox'] ?? true);
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
            $this->markPaid($order, $intent, [
                'payment_ref' => $refId !== null ? (string) $refId : null,
                'payment_provider' => 'zarinpal',
            ]);
            $intent->update(['status' => 'completed']);

            return $this->finish(true, $order);
        }

        $this->markAttemptFailed($request, $order, $intent);

        return $this->finish(false);
    }

    protected function handleDigipay(Request $request, Order $order): RedirectResponse
    {
        $trackingCode = (string) ($request->query('trackingCode') ?? $request->query('tracking_code') ?? '');
        $providerId = (string) ($request->query('providerId') ?? $request->query('provider_id') ?? '');
        if ($trackingCode === '') {
            return $this->finish(false);
        }

        $intent = $providerId !== ''
            ? $this->intentMatching($order, 'digipay', 'provider_id', $providerId)
            : $this->latestIntent($order, 'digipay');
        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false);
        }

        $storedProvider = (string) data_get($intent->meta, 'provider_id', '');
        if ($storedProvider === '' || ($providerId !== '' && ! hash_equals($storedProvider, $providerId))) {
            return $this->finish(false);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'digipay');
        $token = $this->digipay->bearerToken($settings);
        if ($token === null) {
            return $this->finish(false);
        }

        $verify = Http::timeout(30)
            ->withHeaders([
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
                'Digipay-Version' => $this->digipay->version($settings),
            ])
            ->post($this->digipay->baseUrl($settings).'/purchases/verify?type=11', [
                'trackingCode' => $trackingCode,
                'providerId' => $storedProvider,
            ])
            ->json();

        $paidAmount = data_get($verify, 'amount') ?? data_get($verify, 'amountRial');
        $expected = (int) data_get($intent->meta, 'amount_rial', 0);
        $amountOk = $paidAmount === null || $paidAmount === '' || (int) $paidAmount === $expected;

        if ((int) data_get($verify, 'result.status') === 0 && $amountOk && $expected > 0) {
            $this->markPaid($order, $intent, [
                'payment_ref' => $trackingCode,
                'payment_provider' => 'digipay',
            ]);
            $intent->update(['status' => 'completed', 'meta' => array_merge($intent->meta ?? [], [
                'tracking_code' => $trackingCode,
            ])]);

            return $this->finish(true, $order);
        }

        $this->markAttemptFailed($request, $order, $intent);

        return $this->finish(false);
    }

    protected function handleBnpl(Request $request, Order $order, string $provider, bool $requireSettle): RedirectResponse
    {
        $queryToken = (string) ($request->query('paymentToken') ?? '');
        $state = strtoupper((string) ($request->query('state') ?? $request->query('Status') ?? ''));
        $intent = $this->intentMatching($order, $provider, 'payment_token', $queryToken);
        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false);
        }

        if ($state !== 'OK') {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, $provider);
        $verify = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/verify', [
            'paymentToken' => $queryToken,
        ]);
        $expected = (int) data_get($intent->meta, 'amount_rial', 0);
        $reported = data_get($verify['data'], 'response.amount') ?? data_get($verify['data'], 'amount');
        $amountOk = $reported === null || $reported === '' || (int) $reported === $expected;
        if (! $verify['ok'] || ! $amountOk || $expected < 1) {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false);
        }

        $shouldSettle = $requireSettle || ! empty($settings['settle_enabled']);
        if ($shouldSettle) {
            $settle = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/settle', [
                'paymentToken' => $queryToken,
            ]);
            if (! $settle['ok']) {
                $this->markAttemptFailed($request, $order, $intent);

                return $this->finish(false);
            }
        }

        $this->markPaid($order, $intent, [
            'payment_ref' => $queryToken,
            'payment_provider' => $provider,
        ]);
        $intent->update(['status' => 'completed']);

        return $this->finish(true, $order);
    }

    protected function intentMatching(Order $order, string $provider, string $metaKey, string $presented): ?PaymentIntent
    {
        if ($presented === '') {
            return null;
        }

        $rows = PaymentIntent::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->where('provider', $provider)
            ->latest()
            ->limit(8)
            ->get();

        foreach ($rows as $row) {
            $stored = (string) data_get($row->meta, $metaKey, '');
            if ($stored !== '' && hash_equals($stored, $presented)) {
                return $row;
            }
        }

        return null;
    }

    protected function latestIntent(Order $order, string $provider): ?PaymentIntent
    {
        return PaymentIntent::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->where('provider', $provider)
            ->latest()
            ->first();
    }

    /**
     * Missing state is tolerated on success (some gateways replace the query string).
     * A presented state that does not match is always rejected.
     * Failure updates require the state, so a leaked authority cannot burn the order.
     */
    protected function stateAllows(Request $request, PaymentIntent $intent, bool $required): bool
    {
        $expected = (string) data_get($intent->meta, 'state', '');
        $given = (string) $request->query('nonce', '');
        if ($given !== '' && $expected !== '' && ! hash_equals($expected, $given)) {
            return false;
        }
        if ($required && ($given === '' || $expected === '')) {
            return false;
        }

        return true;
    }

    protected function markAttemptFailed(Request $request, Order $order, PaymentIntent $intent): void
    {
        if (! $this->stateAllows($request, $intent, true)) {
            return;
        }
        if ($intent->status !== 'completed') {
            $intent->update(['status' => 'failed']);
        }
        $this->markFailed($order);
    }

    /** @param  array<string, mixed>  $extra */
    protected function markPaid(Order $order, PaymentIntent $intent, array $extra): void
    {
        $fresh = $order->fresh() ?? $order;
        if ($fresh->status === 'paid') {
            return;
        }
        $charged = (int) data_get($intent->meta, 'charge_minor', 0);

        $this->statuses->apply($fresh, 'paid', array_merge($extra, [
            'amount_paid_minor' => $charged > 0 ? $charged : (int) $fresh->total_minor,
        ]));
    }

    protected function markFailed(Order $order): void
    {
        $fresh = $order->fresh() ?? $order;
        if (! in_array($fresh->status, ['pending_payment', 'awaiting_gateway', 'payment_failed'], true)) {
            return;
        }
        $this->statuses->apply($fresh, 'payment_failed');
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
