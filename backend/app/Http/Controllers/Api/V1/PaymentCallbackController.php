<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentIntent;
use App\Services\Payments\DigipayClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Browser redirects from Digipay / Zarinpal (no Sanctum session).
 */
class PaymentCallbackController extends Controller
{
    public function handle(Request $request, string $provider, Order $order): RedirectResponse
    {
        $provider = strtolower($provider);

        return match ($provider) {
            'zarinpal' => $this->handleZarinpal($request, $order),
            'digipay' => $this->handleDigipay($request, $order),
            default => $this->finish(false),
        };
    }

    protected function handleZarinpal(Request $request, Order $order): RedirectResponse
    {
        $merchantId = (string) config('services.zarinpal.merchant_id');
        $sandbox = (bool) config('services.zarinpal.sandbox', true);

        $authority = $request->query('Authority');
        $status = $request->query('Status');

        $intent = PaymentIntent::query()
            ->where('order_id', $order->id)
            ->where('provider', 'zarinpal')
            ->latest()
            ->first();

        if ($merchantId === '' || ! $authority || $status !== 'OK') {
            $order->update(['status' => 'payment_failed']);

            return $this->finish(false);
        }

        $verifyHost = $sandbox
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
            : 'https://api.zarinpal.com/pg/v4/payment/verify.json';

        $verify = Http::timeout(30)->post($verifyHost, [
            'merchant_id' => $merchantId,
            'authority' => $authority,
            'amount' => (int) $order->total_minor,
        ])->json();

        if (($verify['data']['code'] ?? null) === 100) {
            $refId = $verify['data']['ref_id'] ?? null;
            $order->update([
                'status' => 'paid',
                'payment_ref' => $refId !== null ? (string) $refId : null,
                'payment_provider' => 'zarinpal',
            ]);
            $intent?->update(['status' => 'completed']);

            return $this->finish(true);
        }

        $order->update(['status' => 'payment_failed']);

        return $this->finish(false);
    }

    protected function handleDigipay(Request $request, Order $order): RedirectResponse
    {
        $trackingCode = $request->query('trackingCode')
            ?? $request->query('tracking_code');

        $intent = PaymentIntent::query()
            ->where('order_id', $order->id)
            ->where('provider', 'digipay')
            ->latest()
            ->first();

        $token = app(DigipayClient::class)->bearerToken();
        $base = rtrim((string) config('services.digipay.base_url'), '/');
        $providerId = config('services.digipay.provider_id');

        if ($trackingCode === null || $trackingCode === '' || $token === null || $providerId === null || $providerId === '') {
            $order->update(['status' => 'payment_failed']);

            return $this->finish(false);
        }

        $verify = Http::timeout(30)
            ->withHeaders([
                'Authorization' => 'Bearer '.$token,
                'Content-Type' => 'application/json',
            ])
            ->post($base.'/purchases/verify?type=5', [
                'trackingCode' => $trackingCode,
                'providerId' => is_numeric((string) $providerId)
                    ? (int) $providerId
                    : (string) $providerId,
            ])
            ->json();

        if (data_get($verify, 'result.status') === 0) {
            $order->update([
                'status' => 'paid',
                'payment_ref' => is_scalar($trackingCode) ? (string) $trackingCode : null,
                'payment_provider' => 'digipay',
            ]);
            $intent?->update(['status' => 'completed']);

            return $this->finish(true);
        }

        $order->update(['status' => 'payment_failed']);

        return $this->finish(false);
    }

    protected function finish(bool $ok): RedirectResponse
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return redirect()->away($base.'/checkout?payment='.($ok ? 'success' : 'failed'));
    }
}
