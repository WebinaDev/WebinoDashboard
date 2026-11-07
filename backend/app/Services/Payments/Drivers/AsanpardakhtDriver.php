<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://ipgrest.asanpardakht.ir/v1/ */
class AsanpardakhtDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;

    private const BASE = 'https://ipgrest.asanpardakht.ir/v1/';

    public function code(): string { return 'asanpardakht'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['merchant_config_id', 'username', 'password'])) {
            return $miss;
        }
        $invoiceId = (int) ($meta['order_id'] ?? time());
        $time = $this->call('GET', 'Time', $config);
        $localDate = (string) ($time['content'] ?? date('Ymd His'));
        $token = $this->call('POST', 'Token', $config, [
            'serviceTypeId' => 1,
            'merchantConfigurationId' => (int) $config['merchant_config_id'],
            'localInvoiceId' => $invoiceId,
            'amountInRials' => $amountRial,
            'localDate' => $localDate,
            'callbackURL' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'invoice='.$invoiceId,
            'paymentId' => '0',
            'additionalData' => mb_substr($description, 0, 100),
        ]);
        if ((int) ($token['status_code'] ?? 0) !== 200 || empty($token['content'])) {
            return ['ok' => false, 'message' => 'AsanPardakht token failed: '.json_encode($token)];
        }
        $refId = (string) $token['content'];
        $bridge = $this->formBridgeMeta('https://asan.shaparak.ir', array_filter([
            'RefID' => $refId,
            'mobileap' => $meta['mobile'] ?? null,
        ], fn ($v) => $v !== null && $v !== ''));

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $refId,
            'meta' => array_merge($bridge, [
                'asanpardakht_ref' => $refId,
                'asanpardakht_invoice' => (string) $invoiceId,
                'amount_rial' => $amountRial,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $invoice = (string) ($callback['invoice'] ?? $intentMeta['asanpardakht_invoice'] ?? '');
        if ($invoice === '') {
            return ['ok' => false, 'message' => 'شناسه فاکتور آسان‌پرداخت یافت نشد.'];
        }
        $result = $this->call('GET', 'TranResult?merchantConfigurationId='.(int) ($config['merchant_config_id'] ?? 0).'&localInvoiceId='.$invoice, $config);
        if ((int) ($result['status_code'] ?? 0) !== 200) {
            return ['ok' => false, 'message' => 'استعلام آسان‌پرداخت ناموفق بود.', 'meta' => $result];
        }
        $content = is_array($result['content'] ?? null) ? $result['content'] : [];
        $payGateTranId = (int) ($content['payGateTranID'] ?? 0);
        if ($payGateTranId <= 0) {
            return ['ok' => false, 'message' => 'شناسه تراکنش آسان‌پرداخت یافت نشد.', 'meta' => $content];
        }
        $verify = $this->call('POST', 'Verify', $config, [
            'merchantConfigurationId' => (int) ($config['merchant_config_id'] ?? 0),
            'payGateTranId' => $payGateTranId,
        ]);
        if ((int) ($verify['status_code'] ?? 0) !== 200) {
            return ['ok' => false, 'message' => 'تأیید آسان‌پرداخت ناموفق بود.', 'meta' => $verify];
        }
        $this->call('POST', 'Settlement', $config, [
            'merchantConfigurationId' => (int) ($config['merchant_config_id'] ?? 0),
            'payGateTranId' => $payGateTranId,
        ]);

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) ($content['rrn'] ?? $payGateTranId),
            'meta' => $content,
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['merchant_config_id', 'username', 'password'])
            ?? ['ok' => true, 'message' => 'پیکربندی آسان‌پرداخت کامل است.'];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $body
     * @return array{status_code: int, content: mixed} */
    private function call(string $method, string $path, array $config, array $body = []): array
    {
        $req = Http::timeout(40)
            ->withBasicAuth((string) ($config['username'] ?? ''), (string) ($config['password'] ?? ''))
            ->acceptJson()
            ->withHeaders(['Content-Type' => 'application/json']);
        $url = str_starts_with($path, 'http') ? $path : self::BASE.$path;
        $response = strtoupper($method) === 'GET'
            ? $req->get($url)
            : $req->asJson()->post($url, $body);
        $json = $response->json();

        return [
            'status_code' => $response->status(),
            'content' => $json ?? $response->body(),
        ];
    }
}
