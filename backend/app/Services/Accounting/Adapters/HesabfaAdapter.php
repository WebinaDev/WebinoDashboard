<?php

namespace App\Services\Accounting\Adapters;

use App\Services\Accounting\AccountingAdapterInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Official Hesabfa API v1 (api.hesabfa.com) — ported from WP Accounting_Hesabfa_Client.
 */
final class HesabfaAdapter implements AccountingAdapterInterface
{
    public const BASE = 'https://api.hesabfa.com/v1/';

    public function id(): string
    {
        return 'hesabfa';
    }

    public function labelFa(): string
    {
        return 'حسابفا';
    }

    public function labelEn(): string
    {
        return 'Hesabfa';
    }

    public function status(): string
    {
        return 'live';
    }

    public function settingsSchema(): array
    {
        return [
            'enabled' => ['type' => 'boolean', 'default' => false],
            'api_key' => ['type' => 'password', 'required' => true],
            'login_token' => ['type' => 'password', 'required' => false],
            'user_id' => ['type' => 'string', 'required' => false],
            'password' => ['type' => 'password', 'required' => false],
            'year_id' => ['type' => 'integer', 'required' => false],
            'auto_sync_orders' => ['type' => 'boolean', 'default' => true],
        ];
    }

    public function testConnection(array $settings): array
    {
        $res = $this->request('setting/getCurrency', $settings);
        if (! ($res['ok'] ?? false)) {
            return $res;
        }

        return [
            'ok' => true,
            'message' => 'connected',
            'data' => $res['data'] ?? null,
        ];
    }

    public function pushInvoice(array $settings, array $invoicePayload): array
    {
        if (empty($settings['enabled'])) {
            return ['ok' => false, 'message' => 'hesabfa_disabled'];
        }

        $body = [
            'invoice' => $invoicePayload,
            'requestUniqueId' => (string) Str::uuid(),
        ];
        $res = $this->request('invoice/save', $settings, $body, true);
        if (! ($res['ok'] ?? false)) {
            return $res;
        }
        $result = is_array($res['data'] ?? null) ? $res['data'] : [];
        $remote = $result['Result']['Number'] ?? $result['Result']['Id'] ?? $result['Number'] ?? null;

        return [
            'ok' => true,
            'remote_id' => $remote !== null ? (string) $remote : null,
            'data' => $result,
        ];
    }

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $extra
     * @return array{ok: bool, message?: string, data?: mixed}
     */
    public function request(string $method, array $settings, array $extra = [], bool $write = false): array
    {
        $apiKey = trim((string) ($settings['api_key'] ?? ''));
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'hesabfa_api_key_missing'];
        }

        $body = array_merge(['apiKey' => $apiKey], $extra);
        $token = trim((string) ($settings['login_token'] ?? ''));
        if ($token !== '') {
            $body['loginToken'] = $token;
        } else {
            $user = trim((string) ($settings['user_id'] ?? ''));
            $pass = (string) ($settings['password'] ?? '');
            if ($user === '' || $pass === '') {
                return ['ok' => false, 'message' => 'hesabfa_auth_missing'];
            }
            $body['userId'] = $user;
            $body['password'] = $pass;
        }

        $year = (int) ($settings['year_id'] ?? 0);
        if ($year > 0 && ! isset($body['yearId'])) {
            $body['yearId'] = $year;
        }
        if ($write && empty($body['requestUniqueId'])) {
            $body['requestUniqueId'] = (string) Str::uuid();
        }

        try {
            $response = Http::timeout(45)
                ->acceptJson()
                ->asJson()
                ->post(self::BASE.ltrim($method, '/'), $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }

        $decoded = $response->json();
        if (! $response->successful()) {
            return [
                'ok' => false,
                'message' => 'http_'.$response->status(),
                'data' => $decoded,
            ];
        }
        if (is_array($decoded) && array_key_exists('Success', $decoded) && ! $decoded['Success']) {
            return [
                'ok' => false,
                'message' => (string) ($decoded['ErrorMessage'] ?? $decoded['Message'] ?? 'hesabfa_error'),
                'data' => $decoded,
            ];
        }

        return ['ok' => true, 'data' => $decoded];
    }
}
