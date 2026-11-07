<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Sadad (Bank Melli) VPG. SignData = TripleDES-ECB(PKCS7) of TerminalId;OrderId;Amount.
 *
 * @see https://sadad.shaparak.ir/VPG/api/v0/Request/PaymentRequest
 */
class SadadDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string
    {
        return 'sadad';
    }

    public function status(): string
    {
        return 'live';
    }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['terminal_id', 'merchant_id', 'terminal_key'])) {
            return $miss;
        }
        $terminalId = (string) $config['terminal_id'];
        $orderId = (string) ($meta['order_id'] ?? time());
        $sign = $this->signData($terminalId.';'.$orderId.';'.$amountRial, (string) $config['terminal_key']);
        if ($sign === null) {
            return ['ok' => false, 'message' => 'ساخت SignData سداد ناموفق بود (کلید ترمینال).'];
        }
        $base = ! empty($config['sandbox'])
            ? 'https://sandbox.banktest.ir/melli/sadad.shaparak.ir'
            : 'https://sadad.shaparak.ir';
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/VPG/api/v0/Request/PaymentRequest', [
            'MerchantId' => (string) $config['merchant_id'],
            'TerminalId' => $terminalId,
            'Amount' => $amountRial,
            'OrderId' => $orderId,
            'LocalDateTime' => date('Y/m/d H:i:s'),
            'ReturnUrl' => $callbackUrl,
            'SignData' => $sign,
        ])->json();
        $resCode = (string) data_get($response, 'ResCode', '-1');
        $token = (string) data_get($response, 'Token', '');
        if ($resCode !== '0' || $token === '') {
            return ['ok' => false, 'message' => 'Sadad request failed: '.(data_get($response, 'Description') ?? json_encode($response))];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $base.'/VPG/Purchase?Token='.urlencode($token),
            'authority' => $token,
            'meta' => [
                'sadad_token' => $token,
                'sadad_order_id' => $orderId,
                'amount_rial' => $amountRial,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $resCode = (string) ($callback['ResCode'] ?? $callback['resCode'] ?? '');
        $token = (string) ($callback['token'] ?? $callback['Token'] ?? $intentMeta['sadad_token'] ?? '');
        if ($resCode !== '0' || $token === '') {
            return ['ok' => false, 'message' => 'پرداخت سداد ناموفق یا لغو شد.'];
        }
        $sign = $this->signData($token, (string) ($config['terminal_key'] ?? ''));
        if ($sign === null) {
            return ['ok' => false, 'message' => 'ساخت SignData تأیید سداد ناموفق بود.'];
        }
        $base = ! empty($config['sandbox'])
            ? 'https://sandbox.banktest.ir/melli/sadad.shaparak.ir'
            : 'https://sadad.shaparak.ir';
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/VPG/api/v0/Advice/Verify', [
            'Token' => $token,
            'SignData' => $sign,
        ])->json();
        $verifyCode = (string) data_get($response, 'ResCode', '-1');
        if ($verifyCode !== '0') {
            return ['ok' => false, 'message' => 'تأیید سداد ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        $paid = (int) data_get($response, 'Amount', 0);
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'RetrivalRefNo', data_get($response, 'SystemTraceNo', $token)),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['terminal_id', 'merchant_id', 'terminal_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی سداد کامل است.'];
    }

    private function signData(string $data, string $terminalKey): ?string
    {
        $key = base64_decode($terminalKey, true);
        if ($key === false || $key === '') {
            return null;
        }
        // DES-EDE3 ECB + PKCS#7 (OpenSSL default padding).
        $encrypted = openssl_encrypt($data, 'DES-EDE3', $key, OPENSSL_RAW_DATA);
        if ($encrypted === false) {
            return null;
        }

        return base64_encode($encrypted);
    }
}
