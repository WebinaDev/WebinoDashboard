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
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Tenant\TenantResolver;
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
        protected GatewayDriverRegistry $drivers,
        protected LoyaltyService $loyalty,
        protected OrderStatusService $statuses,
    ) {}

    public function handle(Request $request, string $provider, int $order): RedirectResponse
    {
        $row = $this->callbackOrder($request, $order);
        if (! $row) {
            return $this->finish(false);
        }
        $provider = str_replace('-', '_', strtolower($provider));

        if ($row->status === 'paid' || ($row->status === 'on_hold' && ! empty(($row->meta ?? [])['refund_required']))) {
            return $this->finish(true, $row);
        }

        return match ($provider) {
            'zarinpal' => $this->handleZarinpal($request, $row),
            'zibal' => $this->handleViaDriver($request, $row, 'zibal', 'zibal_track_id', 'trackId'),
            'idpay' => $this->handleViaDriver($request, $row, 'idpay', 'idpay_id', 'id'),
            'nextpay' => $this->handleViaDriver($request, $row, 'nextpay', 'nextpay_trans_id', 'trans_id'),
            'payping' => $this->handleViaDriver($request, $row, 'payping', 'payping_code', 'refid'),
            'payir' => $this->handleViaDriver($request, $row, 'payir', 'payir_token', 'token'),
            'vandar' => $this->handleViaDriver($request, $row, 'vandar', 'vandar_token', 'token'),
            'aghayepardakht' => $this->handleViaDriver($request, $row, 'aghayepardakht', 'aghayepardakht_transid', 'transid'),
            'bitpay' => $this->handleViaDriver($request, $row, 'bitpay', 'bitpay_id_get', 'id_get'),
            // SEP returns ResNum (our order key) plus RefNum (verify receipt); match on ResNum.
            'saman' => $this->handleViaDriver($request, $row, 'saman', 'saman_res_num', 'ResNum'),
            'sadad' => $this->handleViaDriver($request, $row, 'sadad', 'sadad_token', 'token'),
            'parsian' => $this->handleViaDriver($request, $row, 'parsian', 'parsian_token', 'Token'),
            'mellat' => $this->handleViaDriver($request, $row, 'mellat', 'mellat_ref_id', 'RefId'),
            'stripe' => $this->handleViaDriver($request, $row, 'stripe', 'stripe_session_id', 'session_id'),
            'paypal' => $this->handleViaDriver($request, $row, 'paypal', 'paypal_order_id', 'token'),
            'nowpayments' => $this->handleViaDriver($request, $row, 'nowpayments', 'nowpayments_id', 'payment_id'),
            'cryptomus' => $this->handleViaDriver($request, $row, 'cryptomus', 'cryptomus_uuid', 'uuid'),
            'coingate' => $this->handleViaDriver($request, $row, 'coingate', 'coingate_id', 'id'),
            'shepa' => $this->handleViaDriver($request, $row, 'shepa', 'shepa_token', 'token'),
            'paystar' => $this->handleViaDriver($request, $row, 'paystar', 'paystar_ref_num', 'ref_num'),
            'jibit' => $this->handleViaDriver($request, $row, 'jibit', 'jibit_purchase_id', 'purchaseId'),
            'parspal' => $this->handleViaDriver($request, $row, 'parspal', 'parspal_payment_id', 'payment_id'),
            'payfa' => $this->handleViaDriver($request, $row, 'payfa', 'payfa_payment_id', 'paymentId'),
            'easypay' => $this->handleViaDriver($request, $row, 'easypay', 'easypay_token', 'token'),
            'zarinplus' => $this->handleViaDriver($request, $row, 'zarinplus', 'zarinplus_authority', 'authority'),
            'toman' => $this->handleViaDriver($request, $row, 'toman', 'toman_uuid', 'uuid'),
            'tara' => $this->handleViaDriver($request, $row, 'tara', 'tara_token', 'token'),
            'asanpardakht' => $this->handleViaDriver($request, $row, 'asanpardakht', 'asanpardakht_invoice', 'invoice'),
            'pasargad' => $this->handleViaDriver($request, $row, 'pasargad', 'pasargad_invoice', 'invoiceId'),
            'sepehr' => $this->handleViaDriver($request, $row, 'sepehr', 'sepehr_token', 'token'),
            'saderat' => $this->handleViaDriver($request, $row, 'saderat', 'sepehr_token', 'token'),
            'samankish' => $this->handleViaDriver($request, $row, 'samankish', 'saman_res_num', 'ResNum'),
            'irankish' => $this->handleViaDriver($request, $row, 'irankish', 'irankish_token', 'token'),
            'omidpay' => $this->handleViaDriver($request, $row, 'omidpay', 'omidpay_token', 'token'),
            'iran_wallet' => $this->handleViaDriver($request, $row, 'iran_wallet', 'iran_wallet_token', 'token'),
            'perfect_money' => $this->handleViaDriver($request, $row, 'perfect_money', 'perfect_money_payment_id', 'PAYMENT_ID'),
            'payeer' => $this->handleViaDriver($request, $row, 'payeer', 'payeer_order_id', 'm_orderid'),
            'coinpayments' => $this->handleViaDriver($request, $row, 'coinpayments', 'coinpayments_txn_id', 'txn_id'),
            'binance_pay' => $this->handleViaDriver($request, $row, 'binance_pay', 'binance_merchant_trade_no', 'merchantTradeNo'),
            'ircryptopay' => $this->handleViaDriver($request, $row, 'ircryptopay', 'ircryptopay_id', 'id'),
            'digipay' => $this->handleDigipay($request, $row),
            'snapppay' => $this->handleBnpl($request, $row, 'snapppay', true),
            'torobpay' => $this->handleBnpl($request, $row, 'torobpay', false),
            BasalamPay::PROVIDER => $this->handleBasalamPay($request, $row),
            // Bale Pay is confirmed only by the bot's successful_payment update; the return URL never marks paid.
            'bale_pay' => $this->finish(($row->fresh() ?? $row)->status === 'paid', $row),
            default => $this->finish(false),
        };
    }

    /**
     * Generic verify path for registry-backed cash IPGs.
     */
    protected function handleViaDriver(
        Request $request,
        Order $order,
        string $provider,
        string $metaKey,
        string $queryKey,
    ): RedirectResponse {
        $presented = (string) ($request->query($queryKey) ?? $request->input($queryKey) ?? '');
        // PayPing may return refid without the original payment code in query.
        $intent = $presented !== ''
            ? $this->intentMatching($order, $provider, $metaKey, $presented)
            : PaymentIntent::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('order_id', $order->id)
                ->where('provider', $provider)
                ->latest()
                ->first();
        // Providers that may omit the original authority/token on return (or send a
        // different receipt id) still resolve to the latest intent for this order.
        if ($intent === null && in_array($provider, [
            'payping', 'saman', 'samankish', 'mellat', 'stripe', 'paypal', 'nowpayments', 'cryptomus', 'coingate',
            'shepa', 'paystar', 'jibit', 'parspal', 'payfa', 'easypay', 'zarinplus', 'toman', 'tara',
            'asanpardakht', 'pasargad', 'sepehr', 'saderat', 'irankish', 'omidpay', 'iran_wallet',
            'perfect_money', 'payeer', 'coinpayments', 'binance_pay', 'ircryptopay',
        ], true)) {
            $intent = PaymentIntent::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('order_id', $order->id)
                ->where('provider', $provider)
                ->latest()
                ->first();
        }
        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false, $order);
        }

        $driver = $this->drivers->get($provider);
        if (! $driver || $driver->status() !== 'live') {
            return $this->finish(false, $order);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, $provider);
        $amountRial = (int) data_get($intent->meta, 'amount_rial', 0);
        $callback = array_merge($request->query(), $request->all());
        $result = $driver->verify($settings, $amountRial, $callback, is_array($intent->meta) ? $intent->meta : []);
        if (! ($result['ok'] ?? false)) {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false, $order);
        }

        $this->markPaid($order, $intent, [
            'payment_ref' => (string) ($result['ref_id'] ?? $presented),
            'payment_provider' => $provider,
        ]);
        $intent->update(['status' => 'completed']);

        return $this->finish(true, $order);
    }

    /**
     * On a public host the order must belong to that host's tenant.
     * Internal hosts (tests, probes) keep numeric lookup so local callbacks still resolve.
     */
    protected function callbackOrder(Request $request, int $orderId): ?Order
    {
        $resolver = app(TenantResolver::class);
        $query = Order::query()->whereKey($orderId);
        $host = $resolver->normalizeHost($request->getHost());
        if (! $resolver->isInternalHost($host)) {
            $tenant = $resolver->identifyFromRequest($request);
            if (! $tenant) {
                return null;
            }
            $query->where('tenant_id', $tenant->id);
        }

        return $query->first();
    }

    public function handleBasalamPay(Request $request, Order $order): RedirectResponse
    {
        try {
            $hash = (string) ($request->input('hash_id') ?? $request->input('hash') ?? '');
            $intent = PaymentIntent::query()
                ->where('order_id', $order->id)
                ->where('tenant_id', $order->tenant_id)
                ->where('provider', BasalamPay::PROVIDER)
                ->latest()
                ->first();
            $stored = (string) data_get($intent?->meta, 'hash_id', '');
            if ($hash === '' || $stored === '' || ! hash_equals($stored, $hash)) {
                return $this->finish(false, $order);
            }
            $result = BasalamPay::for((int) $order->tenant_id)->verify($order, $hash);

            return $this->finish($result['paid'], $order);
        } catch (\Throwable $e) {
            MarketplaceLogger::error((int) $order->tenant_id, 'basalam', 'pay', 'Basalam Pay verify failed: '.$e->getMessage(), ['order_id' => $order->id]);

            return $this->finish(false, $order);
        }
    }

    protected function handleZarinpal(Request $request, Order $order): RedirectResponse
    {
        $authority = (string) $request->query('Authority', '');
        $statusRaw = $request->query('Status');
        $status = strtoupper((string) ($statusRaw ?? ''));
        $intent = $this->intentMatching($order, 'zarinpal', 'zarinpal_authority', $authority);

        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false, $order);
        }

        // A bare GET has no Status and must not change the order. An explicit
        // non-OK status with the stored authority does. When the intent carries
        // a callback nonce, that nonce is required so a leaked authority alone
        // cannot burn the order; intents that predate the nonce still fail closed.
        if ($status !== 'OK') {
            if ($statusRaw !== null && $statusRaw !== '') {
                $this->failMatchedIntent($request, $order, $intent);
            }

            return $this->finish(false, $order);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'zarinpal');
        $merchantId = (string) ($settings['merchant_id'] ?? '');
        $amountRial = (int) data_get($intent->meta, 'amount_rial', 0);
        if ($merchantId === '' || $amountRial < 1) {
            return $this->finish(false, $order);
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

        return $this->finish(false, $order);
    }

    protected function handleDigipay(Request $request, Order $order): RedirectResponse
    {
        $trackingCode = (string) ($request->query('trackingCode') ?? $request->query('tracking_code') ?? '');
        $providerId = (string) ($request->query('providerId') ?? $request->query('provider_id') ?? '');
        if ($trackingCode === '' || $providerId === '') {
            return $this->finish(false, $order);
        }

        $intent = $this->intentMatching($order, 'digipay', 'provider_id', $providerId);
        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false, $order);
        }

        $storedProvider = (string) data_get($intent->meta, 'provider_id', '');
        if ($storedProvider === '' || ($providerId !== '' && ! hash_equals($storedProvider, $providerId))) {
            return $this->finish(false, $order);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, 'digipay');
        $token = $this->digipay->bearerToken($settings);
        if ($token === null) {
            return $this->finish(false, $order);
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
        $amountOk = is_numeric($paidAmount) && (int) $paidAmount === $expected;

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

        return $this->finish(false, $order);
    }

    protected function handleBnpl(Request $request, Order $order, string $provider, bool $requireSettle): RedirectResponse
    {
        $queryToken = (string) ($request->query('paymentToken') ?? '');
        $state = strtoupper((string) ($request->query('state') ?? $request->query('Status') ?? ''));
        $intent = $this->intentMatching($order, $provider, 'payment_token', $queryToken);
        if ($intent === null || ! $this->stateAllows($request, $intent, false)) {
            return $this->finish(false, $order);
        }

        if ($state !== 'OK') {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false, $order);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, $provider);
        $verify = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/verify', [
            'paymentToken' => $queryToken,
        ]);
        $expected = (int) data_get($intent->meta, 'amount_rial', 0);
        $reported = data_get($verify['data'], 'response.amount') ?? data_get($verify['data'], 'amount');
        $amountOk = is_numeric($reported) && (int) $reported === $expected;
        if (! $verify['ok'] || ! $amountOk || $expected < 1) {
            $this->markAttemptFailed($request, $order, $intent);

            return $this->finish(false, $order);
        }

        $shouldSettle = $requireSettle || ! empty($settings['settle_enabled']);
        if ($shouldSettle) {
            $settle = $this->bnpl->post($settings, $provider, 'api/online/payment/v1/settle', [
                'paymentToken' => $queryToken,
            ]);
            if (! $settle['ok']) {
                $this->markAttemptFailed($request, $order, $intent);

                return $this->finish(false, $order);
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
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(8)
            ->get();

        // A retried payment can reuse the authority; prefer the intent whose callback nonce matches.
        $nonce = (string) request()->query('nonce', '');
        $first = null;
        foreach ($rows as $row) {
            $stored = (string) data_get($row->meta, $metaKey, '');
            if ($stored !== '' && hash_equals($stored, $presented)) {
                $state = (string) data_get($row->meta, 'state', '');
                if ($nonce !== '' && $state !== '' && hash_equals($state, $nonce)) {
                    return $row;
                }
                $first ??= $row;
            }
        }

        return $first;
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


    protected function failMatchedIntent(Request $request, Order $order, PaymentIntent $intent): void
    {
        $expected = (string) data_get($intent->meta, 'state', '');
        if ($expected !== '') {
            $this->markAttemptFailed($request, $order, $intent);

            return;
        }
        if ($intent->status !== 'completed') {
            $intent->update(['status' => 'failed']);
        }
        $this->markFailed($order);
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
        // Already paid, or already parked for a refund by an earlier (duplicate) callback.
        if ($fresh->status === 'paid' || ! empty(($fresh->meta ?? [])['refund_required'])) {
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
        $order = $order?->fresh() ?? $order;
        $refund = $order && ! empty(($order->meta ?? [])['refund_required']);
        $outcome = $refund ? 'refund_pending' : ($ok ? 'success' : 'failed');
        if ($ok && $order && ! $refund) {
            try {
                $this->loyalty->awardForPaidOrder($order->fresh());
            } catch (\Throwable) {
                // Loyalty must not block payment success redirect.
            }
        }
        $meta = $order && is_array($order->meta) ? $order->meta : [];
        $cafeReturn = ($meta['source'] ?? null) === 'guest_table' ? (string) ($meta['return_url'] ?? '') : '';
        if ($cafeReturn !== '' && preg_match('#^https?://[^/\s]+/catalogue$#i', $cafeReturn)) {
            // Cafe guests go back to the menu on the site they ordered from (URL was built server-side).
            return redirect()->away($cafeReturn.'?order='.$order->id.'&payment='.$outcome);
        }
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return redirect()->away($base.'/checkout?payment='.$outcome);
    }
}
