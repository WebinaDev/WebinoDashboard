<?php

namespace App\Services\Pricing;

use App\Jobs\RecalculatePricesJob;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Port of WFCP_Exchange_API (BrsApi free gold/currency endpoint; prices are in toman).
 */
class ExchangeRateService
{
    public const API_URL = 'https://BrsApi.ir/Api/Market/Gold_Currency.php';

    /** @return array{success: bool, message?: string, price?: float} */
    public static function fetchRate(string $apiKey, string $symbol = 'USD'): array
    {
        if (trim($apiKey) === '') {
            return ['success' => false, 'message' => __('API key is required.')];
        }
        try {
            $res = Http::timeout(10)->acceptJson()->get(self::API_URL, ['key' => $apiKey]);
        } catch (Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
        $data = $res->json();
        if (! is_array($data)) {
            return ['success' => false, 'message' => __('Invalid response from exchange API.')];
        }
        if (! empty($data['message_error'])) {
            return ['success' => false, 'message' => (string) $data['message_error']];
        }

        $list = $data['currency'] ?? $data['data'] ?? $data;
        foreach ((array) $list as $item) {
            if (is_array($item) && ($item['symbol'] ?? null) === $symbol && isset($item['price'])) {
                return ['success' => true, 'price' => (float) $item['price']];
            }
        }

        return ['success' => false, 'message' => __('Symbol :symbol not found.', ['symbol' => $symbol])];
    }

    /** @return array{success: bool, message?: string, price?: float} */
    public static function update(int $tenantId): array
    {
        $general = (new PricingCalculator(PricingSettings::row($tenantId)->payload ?? []))->section('general');
        if (! PricingCalculator::bool($general['api_enabled'] ?? false)) {
            return ['success' => false, 'message' => __('Exchange API is disabled.')];
        }
        $result = self::fetchRate((string) ($general['api_key'] ?? ''), (string) ($general['api_symbol'] ?? 'USD'));
        if (! $result['success']) {
            return $result;
        }

        $row = PricingSettings::row($tenantId);
        $payload = $row->payload ?? [];
        $payload['general'] = array_merge($general, [
            'exchange_rate' => $result['price'],
            'last_api_update' => now()->toIso8601String(),
        ]);
        $row->update(['payload' => $payload]);
        RecalculatePricesJob::start($tenantId, false);

        return $result + ['message' => __('Exchange rate updated.')];
    }
}
