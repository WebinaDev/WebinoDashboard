<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use App\Services\Payments\Drivers\Concerns\ConvertsFxAmount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** @see https://developers.binance.com/docs/binance-pay/api-order-create */
class BinancePayDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;
    use ConvertsFxAmount;

    public function code(): string { return 'binance_pay'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        if ($miss = $this->missingRequired($config, ['api_key', 'secret_key'])) {
            return $miss;
        }
        $fx = $this->fxMinorAmount($config + ['currency' => $config['currency'] ?? 'USDT'], $amountRial, (string) ($config['currency'] ?? 'USDT'));
        if (! ($fx['ok'] ?? false)) {
            return $fx;
        }
        $merchantTradeNo = (string) ($meta['order_id'] ?? Str::uuid());
        $payload = [
            'env' => ['terminalType' => 'WEB'],
            'merchantTradeNo' => $merchantTradeNo,
            'orderAmount' => number_format($fx['amount'] / 100, 2, '.', ''),
            'currency' => $fx['currency'],
            'description' => mb_substr($description, 0, 120),
            'goodsDetails' => [[
                'goodsType' => '01',
                'goodsCategory' => 'Z000',
                'referenceGoodsId' => $merchantTradeNo,
                'goodsName' => mb_substr($description, 0, 80),
            ]],
            'returnUrl' => $callbackUrl,
            'cancelUrl' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'binance_status=cancel',
            'webhookUrl' => preg_replace('#/callback/.*$#', '/webhook/binance_pay', $callbackUrl) ?: $callbackUrl,
        ];
        $response = $this->signed($config, 'POST', '/binancepay/openapi/v3/order', $payload);
        if ((string) data_get($response, 'status', '') !== 'SUCCESS') {
            return ['ok' => false, 'message' => 'Binance Pay request failed: '.(data_get($response, 'errorMessage') ?? json_encode($response))];
        }
        $url = (string) data_get($response, 'data.checkoutUrl', data_get($response, 'data.universalUrl', ''));
        $prepayId = (string) data_get($response, 'data.prepayId', '');
        if ($url === '') {
            return ['ok' => false, 'message' => 'Binance Pay checkout URL missing.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $prepayId !== '' ? $prepayId : $merchantTradeNo,
            'meta' => [
                'binance_prepay_id' => $prepayId,
                'binance_merchant_trade_no' => $merchantTradeNo,
                'provider_ref' => $prepayId !== '' ? $prepayId : $merchantTradeNo,
                'amount_rial' => $amountRial,
                'fx_amount' => $fx['amount'],
                'fx_currency' => $fx['currency'],
            ],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['binance_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت Binance Pay لغو شد.'];
        }
        // Webhook bizStatus == PAY_SUCCESS
        $biz = strtoupper((string) ($callback['bizStatus'] ?? $callback['status'] ?? ''));
        if (in_array($biz, ['PAY_SUCCESS', 'SUCCESS', 'PAID'], true)) {
            return [
                'ok' => true,
                'message' => 'verified',
                'ref_id' => (string) ($callback['merchantTradeNo'] ?? $intentMeta['binance_merchant_trade_no'] ?? ''),
                'meta' => $callback,
            ];
        }
        $merchantTradeNo = (string) ($intentMeta['binance_merchant_trade_no'] ?? $callback['merchantTradeNo'] ?? '');
        if ($merchantTradeNo === '') {
            return ['ok' => false, 'message' => 'شناسه سفارش Binance Pay یافت نشد.'];
        }
        $response = $this->signed($config, 'POST', '/binancepay/openapi/v2/order/query', [
            'merchantTradeNo' => $merchantTradeNo,
        ]);
        $status = strtoupper((string) data_get($response, 'data.status', data_get($response, 'status', '')));
        if (! in_array($status, ['PAID', 'SUCCESS', 'PAY_SUCCESS'], true)) {
            return ['ok' => false, 'message' => 'تأیید Binance Pay هنوز کامل نیست.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'data.transactionId', $merchantTradeNo),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        return $this->missingRequired($config, ['api_key', 'secret_key'])
            ?? ['ok' => true, 'message' => 'پیکربندی Binance Pay کامل است.'];
    }

    /** @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $payload */
    private function signed(array $config, string $method, string $path, array $payload): array
    {
        $timestamp = (string) (int) round(microtime(true) * 1000);
        $nonce = bin2hex(random_bytes(16));
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $payloadToSign = $timestamp."\n".$nonce."\n".$body."\n";
        $signature = strtoupper(hash_hmac('sha512', $payloadToSign, (string) $config['secret_key']));
        $response = Http::timeout(40)
            ->withHeaders([
                'content-type' => 'application/json',
                'BinancePay-Timestamp' => $timestamp,
                'BinancePay-Nonce' => $nonce,
                'BinancePay-Certificate-SN' => (string) $config['api_key'],
                'BinancePay-Signature' => $signature,
            ])
            ->withBody((string) $body, 'application/json')
            ->send($method, 'https://bpay.binanceapi.com'.$path)
            ->json();

        return is_array($response) ? $response : [];
    }
}
