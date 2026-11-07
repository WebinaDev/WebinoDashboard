<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Saman Electronic Payment (SEP) online PG.
 *
 * @see https://sep.shaparak.ir (merchant doc v3.x)
 */
class SamanDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'saman';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['terminal_id'])) {
            return $miss;
        }
        $base = ! empty($config['sandbox'])
            ? 'https://sandbox.banktest.ir/saman'
            : 'https://sep.shaparak.ir';
        $tokenUrl = ! empty($config['sandbox'])
            ? $base.'/sep.shaparak.ir/onlinepg/onlinepg'
            : 'https://sep.shaparak.ir/onlinepg/onlinepg';
        $resNum = (string) ($meta['order_id'] ?? uniqid('sep_', true));
        $response = Http::timeout(30)->acceptJson()->asJson()->post($tokenUrl, array_filter([
            'action' => 'token',
            'TerminalId' => (string) $config['terminal_id'],
            'Amount' => $amountRial,
            'ResNum' => $resNum,
            'RedirectUrl' => $callbackUrl,
            'CellNumber' => $this->normalizeMobile($meta['mobile'] ?? null),
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $token = (string) data_get($response, 'token', '');
        if ((int) data_get($response, 'status', 0) !== 1 || $token === '') {
            $msg = data_get($response, 'errorDesc') ?? data_get($response, 'errorCode') ?? json_encode($response);

            return ['ok' => false, 'message' => 'Saman/SEP request failed: '.$msg];
        }
        $payUrl = ! empty($config['sandbox'])
            ? $base.'/sep.shaparak.ir/OnlinePG/SendToken?token='.urlencode($token)
            : 'https://sep.shaparak.ir/OnlinePG/SendToken?token='.urlencode($token);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $payUrl,
            'authority' => $token,
            'meta' => [
                'saman_token' => $token,
                'saman_res_num' => $resNum,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $state = strtoupper((string) ($callback['State'] ?? $callback['state'] ?? ''));
        $refNum = (string) ($callback['RefNum'] ?? $callback['refNum'] ?? '');
        if (! in_array($state, ['OK', ''], true) || $refNum === '') {
            // Empty state allowed when only RefNum present; explicit failure states reject.
            if ($state !== '' && $state !== 'OK') {
                return ['ok' => false, 'message' => 'پرداخت سامان ناموفق بود ('.$state.').'];
            }
            if ($refNum === '') {
                return ['ok' => false, 'message' => 'رسید دیجیتال سامان یافت نشد.'];
            }
        }
        $verifyUrl = ! empty($config['sandbox'])
            ? 'https://sandbox.banktest.ir/saman/sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction'
            : 'https://sep.shaparak.ir/verifyTxnRandomSessionkey/ipg/VerifyTransaction';
        $response = Http::timeout(30)->acceptJson()->asJson()->post($verifyUrl, [
            'RefNum' => $refNum,
            'TerminalNumber' => (int) ($config['terminal_id'] ?? 0),
        ])->json();
        $success = (bool) data_get($response, 'Success', false);
        $resultCode = (int) data_get($response, 'ResultCode', -1);
        if (! $success || $resultCode !== 0) {
            return ['ok' => false, 'message' => 'تأیید سامان ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        $paid = (int) data_get($response, 'TransactionDetail.OrginalAmount', data_get($response, 'TransactionDetail.OriginalAmount', 0));
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'TransactionDetail.RRN', $refNum),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['terminal_id'])
            ?? ['ok' => true, 'message' => 'پیکربندی سامان کامل است.'];
    }

    private function normalizeMobile(mixed $mobile): ?string
    {
        $m = preg_replace('/\D+/', '', (string) $mobile);
        if ($m === null || $m === '') {
            return null;
        }
        if (str_starts_with($m, '98') && strlen($m) === 12) {
            $m = substr($m, 2);
        }
        if (str_starts_with($m, '0') && strlen($m) === 11) {
            $m = substr($m, 1);
        }

        return strlen($m) === 10 ? $m : null;
    }
}
