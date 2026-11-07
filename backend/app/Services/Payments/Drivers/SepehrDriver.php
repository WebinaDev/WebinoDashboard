<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\BuildsFormBridge;
use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Sepehr (Bank Saderat IPG). Amounts in rials.
 * @see shetabit/multipay Sepehr driver
 */
class SepehrDriver implements GatewayDriverInterface
{
    use BuildsFormBridge;
    use ChecksRequiredConfig;

    public function code(): string { return 'sepehr'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['terminal_id'])) {
            return $miss;
        }
        $invoiceId = (string) ($meta['order_id'] ?? time());
        $query = http_build_query(array_filter([
            'Amount' => $amountRial,
            'callbackURL' => $callbackUrl,
            'InvoiceID' => $invoiceId,
            'TerminalID' => (string) $config['terminal_id'],
            'Payload' => '',
            'CellNumber' => $meta['mobile'] ?? null,
        ], fn ($v) => $v !== null && $v !== ''));
        $raw = Http::timeout(40)
            ->withBody($query, 'application/x-www-form-urlencoded')
            ->post('https://sepehr.shaparak.ir:8081/V1/PeymentApi/GetToken')
            ->body();
        $json = json_decode($raw, true);
        $token = (string) data_get($json, 'Accesstoken', '');
        $status = (int) data_get($json, 'Status', -1);
        if ($token === '' || $status !== 0) {
            return ['ok' => false, 'message' => 'Sepehr request failed: '.$raw];
        }
        $bridge = $this->formBridgeMeta('https://sepehr.shaparak.ir:8080/Pay', [
            'token' => $token,
            'terminalID' => (string) $config['terminal_id'],
        ]);

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $bridge['redirect_url'],
            'authority' => $token,
            'meta' => array_merge($bridge, [
                'sepehr_token' => $token,
                'sepehr_invoice_id' => $invoiceId,
                'amount_rial' => $amountRial,
            ]),
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if ((string) ($callback['respcode'] ?? $callback['RespCode'] ?? '') !== '0') {
            return ['ok' => false, 'message' => 'پرداخت سپهر ناموفق بود.'];
        }
        $digital = (string) ($callback['digitalreceipt'] ?? $callback['digitalReceipt'] ?? '');
        if ($digital === '') {
            return ['ok' => false, 'message' => 'رسید دیجیتال سپهر یافت نشد.'];
        }
        $query = http_build_query([
            'digitalreceipt' => $digital,
            'Tid' => (string) ($config['terminal_id'] ?? ''),
        ]);
        $raw = Http::timeout(40)
            ->withBody($query, 'application/x-www-form-urlencoded')
            ->post('https://sepehr.shaparak.ir:8081/V1/PeymentApi/Advice')
            ->body();
        $json = json_decode($raw, true);
        if (strtoupper((string) data_get($json, 'Status', '')) !== 'OK') {
            return ['ok' => false, 'message' => 'تأیید سپهر ناموفق بود.', 'meta' => ['raw' => $raw]];
        }
        $paid = (int) data_get($json, 'ReturnId', 0);
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) ($callback['rrn'] ?? $digital),
            'meta' => is_array($json) ? $json : ['raw' => $raw],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['terminal_id']) ?? ['ok' => true, 'message' => 'پیکربندی سپهر کامل است.'];
    }
}
