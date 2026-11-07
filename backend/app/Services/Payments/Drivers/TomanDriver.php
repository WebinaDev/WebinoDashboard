<?php

namespace App\Services\Payments\Drivers;

use App\Services\Payments\Drivers\Concerns\ChecksRequiredConfig;
use Illuminate\Support\Facades\Http;

/**
 * Toman S-IPG (docs.tomanpay.net/ipg).
 * Supports Bearer api_key shortcut or OAuth password grant.
 */
class TomanDriver implements GatewayDriverInterface
{
    use ChecksRequiredConfig;

    public function code(): string { return 'toman'; }
    public function status(): string { return 'live'; }

    public function request(array $config, int $amountRial, string $callbackUrl, string $description, array $meta = []): array
    {
        $token = $this->bearer($config);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت تومن ناموفق بود (api_key یا OAuth).'];
        }
        $base = ! empty($config['sandbox']) ? 'https://ipg-staging.toman.ir' : 'https://ipg.toman.ir';
        $response = Http::timeout(40)->withToken($token)->acceptJson()->asJson()->post($base.'/payments', array_filter([
            'amount' => $amountRial,
            'callback_url' => $callbackUrl,
            'tracker_id' => (string) ($meta['order_id'] ?? uniqid('tm_', true)),
            'mobile_number' => $meta['mobile'] ?? null,
            'description' => mb_substr($description, 0, 255),
        ], fn ($v) => $v !== null && $v !== ''))->json();
        $uuid = (string) data_get($response, 'uuid', data_get($response, 'id', ''));
        if ($uuid === '') {
            return ['ok' => false, 'message' => 'Toman request failed: '.json_encode($response)];
        }
        $redirect = (string) data_get($response, 'redirect_url', $base.'/payments/'.$uuid.'/redirect');

        return [
            'ok' => true,
            'message' => 'ok',
            'redirect_url' => $redirect,
            'authority' => $uuid,
            'meta' => ['toman_uuid' => $uuid, 'amount_rial' => $amountRial, 'provider_ref' => $uuid],
        ];
    }

    public function verify(array $config, int $amountRial, array $callback, array $intentMeta = []): array
    {
        $uuid = (string) ($callback['uuid'] ?? $callback['payment_uuid'] ?? $intentMeta['toman_uuid'] ?? '');
        if ($uuid === '') {
            return ['ok' => false, 'message' => 'شناسه پرداخت تومن یافت نشد.'];
        }
        $token = $this->bearer($config);
        if ($token === null) {
            return ['ok' => false, 'message' => 'احراز هویت تومن ناموفق بود.'];
        }
        $base = ! empty($config['sandbox']) ? 'https://ipg-staging.toman.ir' : 'https://ipg.toman.ir';
        $response = Http::timeout(40)->withToken($token)->acceptJson()->asJson()
            ->post($base.'/payments/'.$uuid.'/verify')
            ->json();
        $status = strtolower((string) data_get($response, 'status', data_get($response, 'state', '')));
        $paid = (int) data_get($response, 'amount', 0);
        $ok = in_array($status, ['verified', 'paid', 'success', 'successful'], true)
            || ($status === '' && $paid > 0 && filled(data_get($response, 'uuid', data_get($response, 'id'))));
        if (! $ok) {
            return ['ok' => false, 'message' => 'تأیید تومن ناموفق بود.', 'meta' => is_array($response) ? $response : []];
        }
        if ($paid > 0 && $paid !== $amountRial) {
            return ['ok' => false, 'message' => 'مبلغ تأییدشده با سفارش هم‌خوانی ندارد.'];
        }

        return [
            'ok' => true,
            'message' => 'verified',
            'ref_id' => $uuid,
            'meta' => is_array($response) ? $response : [],
        ];
    }

    public function testConnection(array $config): array
    {
        if (filled($config['api_key'] ?? null) || (filled($config['client_id'] ?? null) && filled($config['client_secret'] ?? null))) {
            return ['ok' => true, 'message' => 'پیکربندی تومن کامل است.'];
        }

        return ['ok' => false, 'message' => 'فیلدهای الزامی ناقص: api_key یا client_id/client_secret'];
    }

    /** @param  array<string, mixed>  $config */
    private function bearer(array $config): ?string
    {
        if (filled($config['api_key'] ?? null)) {
            return (string) $config['api_key'];
        }
        $authBase = ! empty($config['sandbox'])
            ? 'https://auth.qbitpay.org/oauth2/token/'
            : 'https://accounts.qbitpay.org/oauth2/token/';
        $response = Http::timeout(30)
            ->asForm()
            ->withBasicAuth((string) ($config['client_id'] ?? ''), (string) ($config['client_secret'] ?? ''))
            ->post($authBase, [
                'grant_type' => 'password',
                'username' => (string) ($config['username'] ?? ''),
                'password' => (string) ($config['password'] ?? ''),
                'scope' => 'payment.create payment.verify',
            ])->json();
        $token = (string) data_get($response, 'access_token', '');

        return $token !== '' ? $token : null;
    }
}
