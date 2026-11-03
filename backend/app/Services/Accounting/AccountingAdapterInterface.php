<?php

namespace App\Services\Accounting;

interface AccountingAdapterInterface
{
    public function id(): string;

    public function labelFa(): string;

    public function labelEn(): string;

    /** live | coming_soon */
    public function status(): string;

    /**
     * @return array<string, mixed>
     */
    public function settingsSchema(): array;

    /**
     * @param  array<string, mixed>  $settings
     * @return array{ok: bool, message?: string, data?: mixed}
     */
    public function testConnection(array $settings): array;

    /**
     * @param  array<string, mixed>  $settings
     * @param  array<string, mixed>  $invoicePayload
     * @return array{ok: bool, message?: string, remote_id?: string|null, data?: mixed}
     */
    public function pushInvoice(array $settings, array $invoicePayload): array;
}
