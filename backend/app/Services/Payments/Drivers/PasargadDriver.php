<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Pasargad PEP dorsa1 REST API (token + purchase + confirm).
 * Catalog fields: merchant_code, terminal_code; username/password preferred over legacy private_key.
 *
 * @see https://pep.shaparak.ir/dorsa1
 */
class PasargadDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'pasargad'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $username = (string) ($config['username'] ?? $config['merchant_code'] ?? '');
        $password = (string) ($config['password'] ?? $config['private_key'] ?? '');
        if ($username === '' || $password === '') {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: username/password (یا merchant_code/private_key)'];
        }
        $terminal = (string) ($config['terminal_code'] ?? '');
        $merchant = (string) ($config['merchant_code'] ?? $username);
        if ($terminal === '') {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: terminal_code'];
        }
        $base = rtrim((string) ($config['base_url'] ?? 'https://pep.shaparak.ir/dorsa1'), '/');
        $invoiceId = (string) ($meta['order_id'] ?? time());
        $token = $this->token($base, $username, $password);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت پاسارگاد ناموفق بود.'];
        }
        $body = [
            'invoice' => $invoiceId,
            'invoiceDate' => date('Y/m/d H:i:s'),
            'amount' => $amountRial,
            'callbackApi' => $callbackUrl,
            'serviceCode' => (int) ($config['service_code'] ?? 8),
            'serviceType' => 'PURCHASE',
            'terminalNumber' => (int) $terminal,
            'description' => mb_substr($description, 0, 100),
            'mobileNumber' => $meta['mobile'] ?? null,
        ];
        $response = $this->api($base.'/api/payment/purchase', $token, array_filter($body, fn ($v) => $v !== null && $v !== ''));
        if ((int) data_get($response, 'resultCode', -1) !== 0) {
            return ['ok' => false, 'message' => 'Pasargad request failed: '.(data_get($response, 'resultMsg') ?? json_encode($response))];
        }
        $url = (string) data_get($response, 'data.url', '');
        if ($url === '') {
            return ['ok' => false, 'message' => 'Pasargad payment URL missing.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $invoiceId,
            'meta' => [
                'pasargad_invoice' => $invoiceId,
                'pasargad_url_id' => (string) data_get($response, 'data.urlId', data_get($response, 'data.url', '')),
                'amount_rial' => $amountRial,
                'merchant_code' => $merchant,
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $invoiceId = (string) ($callback['invoiceId'] ?? $callback['invoice'] ?? $intentMeta['pasargad_invoice'] ?? '');
        if ($invoiceId === '') {
            return ['ok' => false, 'message' => 'شناسه فاکتور پاسارگاد یافت نشد.'];
        }
        $username = (string) ($config['username'] ?? $config['merchant_code'] ?? '');
        $password = (string) ($config['password'] ?? $config['private_key'] ?? '');
        $base = rtrim((string) ($config['base_url'] ?? 'https://pep.shaparak.ir/dorsa1'), '/');
        $token = $this->token($base, $username, $password);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت پاسارگاد ناموفق بود.'];
        }
        $inquiry = $this->api($base.'/api/payment/payment-inquiry', $token, ['invoiceId' => $invoiceId]);
        if ((int) data_get($inquiry, 'resultCode', -1) !== 0 || (int) data_get($inquiry, 'data.status', -1) !== 0) {
            return ['ok' => false, 'message' => 'استعلام پاسارگاد ناموفق بود.', 'meta' => is_array($inquiry) ? $inquiry : []];
        }
        $paid = (int) data_get($inquiry, 'data.amount', 0);
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }
        $urlId = (string) data_get($inquiry, 'data.url', $intentMeta['pasargad_url_id'] ?? '');
        $confirm = $this->api($base.'/api/payment/confirm-transactions', $token, [
            'invoice' => $invoiceId,
            'urlId' => $urlId,
        ]);
        if ((int) data_get($confirm, 'resultCode', -1) !== 0) {
            return ['ok' => false, 'message' => 'تأیید پاسارگاد ناموفق بود.', 'meta' => is_array($confirm) ? $confirm : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($inquiry, 'data.referenceNumber', data_get($inquiry, 'data.transactionId', $invoiceId)),
            'meta' => ['inquiry' => $inquiry, 'confirm' => $confirm],
        ];
    }

    public function testConnection(array $config): array
    {
        $username = (string) ($config['username'] ?? $config['merchant_code'] ?? '');
        $password = (string) ($config['password'] ?? $config['private_key'] ?? '');
        if ($username === '' || $password === '' || empty($config['terminal_code'])) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: username/password/terminal_code'];
        }

        return ['ok' => true, 'message' => 'پیکربندی پاسارگاد کامل است.'];
    }

    private function token(string $base, string $username, string $password): ?string
    {
        $response = Http::timeout(30)->acceptJson()->asJson()->post($base.'/token/getToken', [
            'username' => $username,
            'password' => $password,
        ])->json();
        if ((int) data_get($response, 'resultCode', -1) !== 0) {
            return null;
        }
        $token = (string) data_get($response, 'token', '');

        return $token !== '' ? $token : null;
    }

    /** @param  array<string, mixed>  $body */
    private function api(string $url, string $token, array $body): array
    {
        $response = Http::timeout(40)
            ->withToken($token)
            ->acceptJson()->asJson()
            ->post($url, $body)
            ->json();

        return is_array($response) ? $response : [];
    }
}
