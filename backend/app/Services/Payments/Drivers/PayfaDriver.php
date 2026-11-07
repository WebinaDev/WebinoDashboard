<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see shetabit/multipay Payfa driver — payment.payfa.com v2 */
class PayfaDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'payfa'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key'])) {
            return $miss;
        }
        $response = Http::timeout(30)
            ->withHeaders(['X-API-Key' => (string) $config['api_key']])
            ->acceptJson()->asJson()
            ->post('https://payment.payfa.com/v2/api/Transaction/Request', array_filter([
                'amount' => $amountRial,
                'callbackUrl' => $callbackUrl,
                'mobileNumber' => $meta['mobile'] ?? null,
                'invoiceId' => (string) ($meta['order_id'] ?? ''),
            ], fn ($v) => $v !== null && $v !== ''));
        $body = $response->json();
        if (! $response->successful()) {
            return ['ok' => false, 'message' => 'Payfa request failed: '.(data_get($body, 'message') ?? $response->body())];
        }
        $paymentId = (string) data_get($body, 'paymentId', data_get($body, 'data.paymentId', ''));
        if ($paymentId === '') {
            return ['ok' => false, 'message' => 'Payfa paymentId missing: '.json_encode($body)];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => 'https://payment.payfa.ir/v2/api/Transaction/Pay/'.$paymentId,
            'authority' => $paymentId,
            'meta' => ['payfa_payment_id' => $paymentId, 'amount_rial' => $amountRial],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $paymentId = (string) ($callback['paymentId'] ?? $callback['payment_id'] ?? $intentMeta['payfa_payment_id'] ?? '');
        if ($paymentId === '') {
            return ['ok' => false, 'message' => 'شناسه پرداخت پی‌فا یافت نشد.'];
        }
        $response = Http::timeout(30)
            ->withHeaders(['X-API-Key' => (string) ($config['api_key'] ?? '')])
            ->acceptJson()->asJson()
            ->post('https://payment.payfa.com/v2/api/Transaction/Verify/'.$paymentId);
        $body = $response->json();
        if (! $response->successful()) {
            return ['ok' => false, 'message' => 'تأیید پی‌فا ناموفق بود.', 'meta' => is_array($body) ? $body : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($body, 'transactionId', $paymentId),
            'meta' => is_array($body) ? $body : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key']) ?? ['ok' => true, 'message' => 'پیکربندی پی‌فا کامل است.'];
    }
}
