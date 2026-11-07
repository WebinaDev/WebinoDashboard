<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Orders\OrderStatusService;
use App\Services\Payments\Drivers\GatewayDriverRegistry;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shop\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Server-to-server IPN / webhook pattern for FX & crypto (and aggregators that POST).
 * Browser redirects still use PaymentCallbackController.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected GatewayDriverRegistry $drivers,
        protected LoyaltyService $loyalty,
        protected OrderStatusService $statuses,
    ) {}

    public function handle(Request $request, string $provider): JsonResponse
    {
        $provider = str_replace('-', '_', strtolower($provider));
        if (! $this->gateways->catalog()->has($provider)) {
            return response()->json(['ok' => false, 'message' => 'unknown provider'], 404);
        }

        $orderId = (int) (
            $request->input('order_id')
            ?? $request->input('orderId')
            ?? $request->input('clientRefId')
            ?? $request->query('order')
            ?? 0
        );
        $intentId = (string) (
            $request->input('payment_id')
            ?? $request->input('invoice_id')
            ?? $request->input('uuid')
            ?? $request->input('id')
            ?? ''
        );

        $intent = null;
        if ($orderId > 0) {
            $intent = PaymentIntent::query()
                ->where('order_id', $orderId)
                ->where('provider', $provider)
                ->latest()
                ->first();
        }
        if (! $intent && $intentId !== '') {
            $intent = PaymentIntent::query()
                ->where('provider', $provider)
                ->where(function ($q) use ($intentId) {
                    $q->where('meta->provider_ref', $intentId)
                        ->orWhere('meta->idpay_id', $intentId)
                        ->orWhere('meta->nowpayments_id', $intentId)
                        ->orWhere('meta->cryptomus_uuid', $intentId)
                        ->orWhere('meta->coingate_id', $intentId)
                        ->orWhere('meta->stripe_session_id', $intentId)
                        ->orWhere('meta->paypal_order_id', $intentId)
                        ->orWhere('meta->coinpayments_txn_id', $intentId)
                        ->orWhere('meta->binance_merchant_trade_no', $intentId)
                        ->orWhere('meta->ircryptopay_id', $intentId)
                        ->orWhere('meta->perfect_money_payment_id', $intentId)
                        ->orWhere('meta->payeer_order_id', $intentId)
                        ->orWhere('meta->shepa_token', $intentId)
                        ->orWhere('meta->jibit_purchase_id', $intentId)
                        ->orWhere('meta->toman_uuid', $intentId)
                        ->orWhere('meta->paystar_ref_num', $intentId);
                })
                ->latest()
                ->first();
        }
        if (! $intent) {
            Log::info('payment.webhook.orphan', ['provider' => $provider]);

            return response()->json(['ok' => false, 'message' => 'intent not found'], 404);
        }

        $order = Order::query()->find($intent->order_id);
        if (! $order) {
            return response()->json(['ok' => false, 'message' => 'order not found'], 404);
        }
        if ($order->status === 'paid' || ! empty(($order->meta ?? [])['refund_required'])) {
            return response()->json(['ok' => true, 'message' => 'already paid']);
        }

        $driver = $this->drivers->get($provider);
        if (! $driver || $driver->status() !== 'live') {
            Log::info('payment.webhook.scaffold', [
                'provider' => $provider,
                'order_id' => $order->id,
            ]);

            return response()->json([
                'ok' => false,
                'message' => 'webhook accepted; driver not live yet',
            ], 202);
        }

        $settings = $this->gateways->getRaw((int) $order->tenant_id, $provider);
        $amountRial = (int) data_get($intent->meta, 'amount_rial', 0);
        $payload = $request->all();
        // Crypto IPNs (e.g. CoinPayments) sign the raw body; preserve for driver HMAC checks.
        $payload['_raw_body'] = $request->getContent();
        $payload['_hmac'] = (string) ($request->header('HMAC') ?? $request->header('X-Signature') ?? '');
        $result = $driver->verify(
            $settings,
            $amountRial,
            $payload,
            is_array($intent->meta) ? $intent->meta : []
        );
        if (! ($result['ok'] ?? false)) {
            if ($intent->status !== 'completed') {
                $intent->update([
                    'status' => 'failed',
                    'meta' => array_merge(is_array($intent->meta) ? $intent->meta : [], [
                        'webhook_verify' => $result,
                    ]),
                ]);
            }

            return response()->json(['ok' => false, 'message' => $result['message'] ?? 'verify failed'], 422);
        }

        $intent->update([
            'status' => 'completed',
            'meta' => array_merge(is_array($intent->meta) ? $intent->meta : [], [
                'ref_id' => $result['ref_id'] ?? null,
                'webhook_verify' => $result['meta'] ?? [],
            ]),
        ]);
        $charged = (int) data_get($intent->meta, 'charge_minor', 0);
        $this->statuses->apply($order, 'paid', [
            'payment_provider' => $provider,
            'payment_ref' => (string) ($result['ref_id'] ?? ''),
            'amount_paid_minor' => $charged > 0 ? $charged : (int) $order->total_minor,
        ]);
        try {
            $this->loyalty->awardForPaidOrder($order->fresh() ?? $order);
        } catch (\Throwable) {
            // ignore
        }

        return response()->json(['ok' => true, 'message' => 'paid']);
    }
}
