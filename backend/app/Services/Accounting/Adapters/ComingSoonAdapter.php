<?php

namespace App\Services\Accounting\Adapters;

use App\Services\Accounting\AccountingAdapterInterface;

final class ComingSoonAdapter implements AccountingAdapterInterface
{
    public function __construct(
        private readonly string $adapterId,
        private readonly string $fa,
        private readonly string $en,
    ) {}

    public function id(): string
    {
        return $this->adapterId;
    }

    public function labelFa(): string
    {
        return $this->fa;
    }

    public function labelEn(): string
    {
        return $this->en;
    }

    public function status(): string
    {
        return 'coming_soon';
    }

    public function settingsSchema(): array
    {
        return [
            'enabled' => ['type' => 'boolean', 'default' => false],
            'note' => ['type' => 'string', 'readonly' => true],
        ];
    }

    public function testConnection(array $settings): array
    {
        return ['ok' => false, 'message' => 'coming_soon'];
    }

    public function pushInvoice(array $settings, array $invoicePayload): array
    {
        return ['ok' => false, 'message' => 'coming_soon'];
    }
}
