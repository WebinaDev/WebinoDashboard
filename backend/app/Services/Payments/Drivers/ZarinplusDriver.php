<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/** @see https://github.com/zarinplus/docs */
class ZarinplusDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'zarinplus'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $token = (string) ($config['access_token'] ?? $config['merchant_id'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'توکن زرین‌پلاس خالی است.'];
        }
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://api.zarinplus.com/payment/v2/request/', array_filter([
            'amount' => $amountRial,
            'token' => $token,
            'gateway_slug' => (string) ($config['gateway_slug'] ?? 'zarinplus'),
            'success' => $callbackUrl,
            'cancel' => $callbackUrl.(str_contains($callbackUrl, '?') ? '&' : '?').'zarinplus_status=cancel',
            'item' => mb_substr($description, 0, 120),
            'cellphone' => $meta['mobile'] ?? null,
            'email' => $meta['email'] ?? null,
        ], fn ($v) => $v !== null && $v !== ''))->json();
        if (! filter_var(data_get($response, 'status'), FILTER_VALIDATE_BOOLEAN)) {
            return ['ok' => false, 'message' => 'Zarinplus request failed: '.(data_get($response, 'message') ?? json_encode($response))];
        }
        $authority = (string) data_get($response, 'authority', '');
        $url = (string) data_get($response, 'redirect_url', '');
        if ($authority === '' || $url === '') {
            return ['ok' => false, 'message' => 'Zarinplus authority/url missing.'];
        }

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $url,
            'authority' => $authority,
            'meta' => ['zarinplus_authority' => $authority, 'amount_rial' => $amountRial],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        if (($callback['zarinplus_status'] ?? '') === 'cancel') {
            return ['ok' => false, 'message' => 'پرداخت زرین‌پلاس لغو شد.'];
        }
        $authority = (string) ($callback['authority'] ?? $intentMeta['zarinplus_authority'] ?? '');
        $token = (string) ($config['access_token'] ?? $config['merchant_id'] ?? '');
        if ($authority === '' || $token === '') {
            return ['ok' => false, 'message' => 'اطلاعات تأیید زرین‌پلاس ناقص است.'];
        }
        $response = Http::timeout(30)->acceptJson()->asJson()->post('https://api.zarinplus.com/payment/v2/verify/', [
            'authority' => $authority,
            'token' => $token,
            'amount' => $amountRial,
        ])->json();
        $code = (int) data_get($response, 'data.code', data_get($response, 'code', 0));
        $ok = filter_var(data_get($response, 'status'), FILTER_VALIDATE_BOOLEAN) && in_array($code, [200, 0], true);
        // Docs: first successful verify returns data.code=200.
        if (! $ok && $code !== 200 && ! filter_var(data_get($response, 'status'), FILTER_VALIDATE_BOOLEAN)) {
            return ['ok' => false, 'message' => 'تأیید زرین‌پلاس ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => (string) data_get($response, 'data.reference', $authority),
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (! filled($config['access_token'] ?? null) && ! filled($config['merchant_id'] ?? null)) {
            return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: access_token یا merchant_id'];
        }

        return ['ok' => true, 'message' => 'پیکربندی زرین‌پلاس کامل است.'];
    }
}
