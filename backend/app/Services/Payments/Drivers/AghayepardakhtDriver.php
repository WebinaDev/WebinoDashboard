<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** Amounts are in tomans. @see https://aqayepardakht.ir/api/ */
class AghayepardakhtDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'aghayepardakht';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['pin'])) {
            return $miss;
        }
        $pin = ! empty($config['sandbox']) ? 'sandbox' : (string) $config['pin'];
        $amountToman = max(1, (int) round($amountRial / 10));
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://panel.aqayepardakht.ir/api/v2/create', array_filter([
            'pin' => $pin,
            'amount' => $amountToman,
            'callback' => $callbackUrl,
            'callback_method' => 'GET',
            'invoice_id' => (string) ($meta['order_id'] ?? ''),
            'mobile' => $meta['mobile'] ?? null,
            'email' => $meta['email'] ?? null,
            'description' => mb_substr($description, 0, 255),
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $transId = (string) data_get($response, 'transid', '');
        if (data_get($response, 'status') !== 'success' || $transId === '') {
            return ['ok' => false, 'message' => 'Aghayepardakht request failed: '.(data_get($response, 'code') ?? json_encode($response))];
        }
        $start = ! empty($config['sandbox'])
            ? 'https://panel.aqayepardakht.ir/startpay/sandbox/'.$transId
            : 'https://panel.aqayepardakht.ir/startpay/'.$transId;

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $start,
            'authority' => $transId,
            'meta' => [
                'aghayepardakht_transid' => $transId,
                'amount_rial' => $amountRial,
                'amount_toman' => $amountToman,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $status = (string) ($callback['status'] ?? '');
        $transId = (string) ($callback['transid'] ?? $intentMeta['aghayepardakht_transid'] ?? '');
        if ($status !== '1' || $transId === '') {
            return ['ok' => false, 'message' => 'پرداخت آقای‌پرداخت ناموفق یا لغو شد.'];
        }
        $pin = ! empty($config['sandbox']) ? 'sandbox' : (string) ($config['pin'] ?? '');
        $amountToman = (int) ($intentMeta['amount_toman'] ?? max(1, round($amountRial / 10)));
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://panel.aqayepardakht.ir/api/v2/verify', [
            'pin' => $pin,
            'amount' => $amountToman,
            'transid' => $transId,
        ])->json();
        $code = (string) data_get($response, 'code', '');
        if (data_get($response, 'status') !== 'success' || ! in_array($code, ['1', '2'], true)) {
            return ['ok' => false, 'message' => 'تأیید آقای‌پرداخت ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => $code === '2' ? 'already-verified' : 'verified',
            'ref_id' => (string) ($callback['tracking_number'] ?? $transId),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['pin'])
            ?? ['ok' => true, 'message' => 'پیکربندی آقای‌پرداخت کامل است.'];
    }
}
