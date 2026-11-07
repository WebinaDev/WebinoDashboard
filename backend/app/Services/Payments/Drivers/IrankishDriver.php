<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** Iran Kish IPG v3 tokenization. Amounts in rials. */
class IrankishDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;

    public function code(): string { return 'irankish'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['terminal_id', 'acceptor_id', 'password', 'public_key'])) {
            return $miss;
        }
        $envelope = $this->envelope((string) $config['public_key'], (string) $config['terminal_id'], (string) $config['password'], $amountRial);
        if ($envelope === null) {
            return ['ok' => false, 'message' => 'ساخت authenticationEnvelope ایران‌کیش ناموفق بود.'];
        }
        $payload = [
            'request' => [
                'acceptorId' => (string) $config['acceptor_id'],
                'amount' => $amountRial,
                'billInfo' => null,
                'paymentId' => null,
                'requestId' => uniqid('ik_', true),
                'requestTimestamp' => time(),
                'revertUri' => $callbackUrl,
                'terminalId' => (string) $config['terminal_id'],
                'transactionType' => 'Purchase',
            ],
            'authenticationEnvelope' => $envelope,
        ];
        $response = Http::timeout(40)->acceptJson()->asJson()
            ->withOptions(['curl' => [CURLOPT_SSL_CIPHER_LIST => 'DEFAULT@SECLEVEL=1']])
            ->post('https://ikc.shaparak.ir/api/v3/tokenization/make', $payload)
            ->json();
        if ((string) data_get($response, 'responseCode', '') !== '00') {
            return ['ok' => false, 'message' => 'IranKish request failed: '.(data_get($response, 'description') ?? json_encode($response))];
        }
        $token = (string) data_get($response, 'result.token', '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'IranKish token missing.'];
        }
        $bridge = $this->formBridgeMeta('https://ikc.shaparak.ir/iuiv3/IPG/Index/', [
            'tokenIdentity' => $token,
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $token,
            'meta' => array_merge($bridge, [
                'irankish_token' => $token,
                'amount_rial' => $amountRial,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if ((string) ($callback['responseCode'] ?? '') !== '00') {
            return ['ok' => false, 'message' => 'پرداخت ایران‌کیش ناموفق بود.'];
        }
        $token = (string) ($callback['token'] ?? $intentMeta['irankish_token'] ?? '');
        $rrn = (string) ($callback['retrievalReferenceNumber'] ?? '');
        $stan = (string) ($callback['systemTraceAuditNumber'] ?? '');
        if ($token === '' || $rrn === '') {
            return ['ok' => false, 'message' => 'پارامترهای تأیید ایران‌کیش ناقص است.'];
        }
        $response = Http::timeout(40)->acceptJson()->asJson()
            ->withOptions(['curl' => [CURLOPT_SSL_CIPHER_LIST => 'DEFAULT@SECLEVEL=1']])
            ->post('https://ikc.shaparak.ir/api/v3/confirmation/purchase', [
                'terminalId' => (string) ($config['terminal_id'] ?? ''),
                'retrievalReferenceNumber' => $rrn,
                'systemTraceAuditNumber' => $stan,
                'tokenIdentity' => $token,
            ])->json();
        // Successful confirmation typically echoes responseCode 00 / empty error.
        if (isset($response['responseCode']) && (string) $response['responseCode'] !== '00') {
            return ['ok' => false, 'message' => 'تأیید ایران‌کیش ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $rrn,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['terminal_id', 'acceptor_id', 'password', 'public_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی ایران‌کیش کامل است.'];
    }

    /** @return array{data: string, iv: string}|null */
    private function envelope(string $pubKey, string $terminalId, string $password, int $amount): ?array
    {
        $data = $terminalId.$password.str_pad((string) $amount, 12, '0', STR_PAD_LEFT).'00';
        $bin = @hex2bin($data);
        if ($bin === false) {
            return null;
        }
        $aesKey = openssl_random_pseudo_bytes(16);
        $iv = openssl_random_pseudo_bytes(16);
        $cipher = openssl_encrypt($bin, 'AES-128-CBC', $aesKey, OPENSSL_RAW_DATA, $iv);
        if ($cipher === false) {
            return null;
        }
        $hmac = hash('sha256', $cipher, true);
        $crypttext = '';
        if (! openssl_public_encrypt($aesKey.$hmac, $crypttext, $pubKey)) {
            return null;
        }

        return ['data' => bin2hex($crypttext), 'iv' => bin2hex($iv)];
    }
}
