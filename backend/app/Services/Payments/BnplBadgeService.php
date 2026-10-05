<?php

namespace App\Services\Payments;

use App\Models\Product;

/**
 * Storefront installment / credit badges for DigiPay, SnappPay, TorobPay.
 * Never invents credentials — only surfaces gateways that are enabled + configured.
 */
class BnplBadgeService
{
    public function __construct(
        protected PaymentGatewaySettingsService $gateways,
        protected DigipayClient $digipay,
        protected BnplClient $bnpl,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function forProduct(int $tenantId, ?Product $product = null, ?int $amountMinor = null): array
    {
        $amount = $amountMinor;
        if ($amount === null && $product !== null) {
            $amount = (int) ($product->sale_price_minor ?: $product->price_minor);
        }
        $amount = max(0, (int) $amount);
        $out = [];

        foreach (['digipay', 'snapppay', 'torobpay'] as $id) {
            if (! $this->gateways->isEnabled($tenantId, $id) || ! $this->gateways->configured($tenantId, $id)) {
                continue;
            }
            $raw = $this->gateways->getRaw($tenantId, $id);
            if (! $this->gateways->supportsMode($raw, 'installment')) {
                continue;
            }
            // SnappPay/TorobPay: respect has_pdp when present; DigiPay defaults to on when installment enabled.
            if (in_array($id, ['snapppay', 'torobpay'], true) && array_key_exists('has_pdp', $raw) && empty($raw['has_pdp'])) {
                continue;
            }
            if ($id === 'digipay' && array_key_exists('has_pdp', $raw) && empty($raw['has_pdp'])) {
                continue;
            }

            $title = match ($id) {
                'digipay' => (string) ($raw['title_bpg'] ?? $raw['title_cpg'] ?? $raw['title_ipg'] ?? 'دیجی‌پی'),
                default => (string) ($raw['title'] ?? $id),
            };
            $description = match ($id) {
                'digipay' => (string) ($raw['description_bpg'] ?? $raw['description_cpg'] ?? ''),
                default => (string) ($raw['description'] ?? ''),
            };

            $out[] = [
                'id' => $id,
                'title' => $title !== '' ? $title : $id,
                'description' => $description,
                'dark' => (bool) ($raw['dark_pdp'] ?? false),
                'amount_minor' => $amount,
                'eligible' => true,
                'checkout_mode' => 'installment',
            ];
        }

        return $out;
    }
}
