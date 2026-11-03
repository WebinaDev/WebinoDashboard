<?php

namespace App\Services\Accounting;

use App\Models\AccAccount;
use App\Models\AccInvoice;
use App\Models\AccInvoiceLine;
use App\Models\AccJournal;
use App\Models\AccJournalLine;
use App\Models\AccPerson;
use App\Models\Order;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Facades\DB;

/**
 * Creates/updates sale invoices + balancing journals from commerce orders.
 */
final class OrderAccountingSync
{
    /** Statuses that should produce an accounting invoice. */
    public const SYNC_STATUSES = [
        'paid',
        'processing',
        'completed',
        'shipped',
        'webino-in-stock',
        'webino-packaged',
        'webino-courier',
        'webino-post',
        'webino-tipax',
        'webino-ready-to-ship',
        'webino-shipping',
        'sent-to-warehouse',
    ];

    public function shouldSync(?string $status): bool
    {
        return in_array((string) $status, self::SYNC_STATUSES, true);
    }

    public function syncOrder(Order $order): AccInvoice
    {
        $order->loadMissing('items');

        return DB::transaction(function () use ($order) {
            $existing = AccInvoice::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('order_id', $order->id)
                ->where('type', 'sale')
                ->first();

            if ($existing && $existing->status === 'posted' && in_array($existing->moadian_status, ['accepted', 'queued', 'sent'], true)) {
                return $existing->load('lines');
            }

            $person = $this->upsertPerson($order);
            $tax = ShopSettings::getTax((int) $order->tenant_id);
            $defaultVat = (float) ($tax['rate_percent'] ?? 10);

            $lines = [];
            $subtotal = 0;
            $taxTotal = 0;
            foreach ($order->items as $item) {
                $qty = max(0.0001, (float) $item->quantity);
                $lineTotal = (int) $item->unit_price_minor * (int) $item->quantity;
                $subtotal += $lineTotal;
                $lineTax = 0;
                if (! empty($tax['enabled'])) {
                    if ((int) ($order->tax_minor ?? 0) > 0 && (int) ($order->subtotal_minor ?? 0) > 0) {
                        $lineTax = (int) round($lineTotal * ((int) $order->tax_minor / max(1, (int) $order->subtotal_minor)));
                    } elseif (! ($tax['prices_include_tax'] ?? false)) {
                        $lineTax = (int) round($lineTotal * ($defaultVat / 100));
                    }
                }
                $taxTotal += $lineTax;
                $meta = is_array($item->meta) ? $item->meta : [];
                $lines[] = [
                    'product_id' => $item->product_id,
                    'description' => (string) ($item->product_name ?: 'Item'),
                    'sku' => $item->sku,
                    'sstid' => (string) ($meta['sstid'] ?? $meta['moadian_sstid'] ?? ''),
                    'qty' => $qty,
                    'unit_price_minor' => (int) $item->unit_price_minor,
                    'discount_minor' => 0,
                    'tax_minor' => $lineTax,
                    'vat_rate' => $defaultVat,
                    'total_minor' => $lineTotal + $lineTax,
                    'meta' => ['order_item_id' => $item->id, 'purchase_type' => $item->purchase_type],
                ];
            }

            $discount = (int) ($order->discount_minor ?? 0);
            $shipping = (int) ($order->shipping_minor ?? 0);
            if ($shipping > 0) {
                $shipTax = 0;
                if (! empty($tax['enabled']) && ! empty($tax['shipping_taxable'])) {
                    $shipTax = (int) round($shipping * ($defaultVat / 100));
                    $taxTotal += $shipTax;
                }
                $lines[] = [
                    'product_id' => null,
                    'description' => 'Shipping',
                    'sku' => null,
                    'sstid' => '',
                    'qty' => 1,
                    'unit_price_minor' => $shipping,
                    'discount_minor' => 0,
                    'tax_minor' => $shipTax,
                    'vat_rate' => $defaultVat,
                    'total_minor' => $shipping + $shipTax,
                    'meta' => ['kind' => 'shipping'],
                ];
                $subtotal += $shipping;
            }

            $total = max(0, $subtotal - $discount + $taxTotal);
            if ((int) ($order->total_minor ?? 0) > 0) {
                $total = (int) $order->total_minor;
                if ((int) ($order->tax_minor ?? 0) > 0) {
                    $taxTotal = (int) $order->tax_minor;
                }
            }

            $buyerTax = is_array($order->buyer_tax) ? $order->buyer_tax : [];
            $number = $existing?->number ?: $this->nextInvoiceNumber((int) $order->tenant_id, $order);

            $payload = [
                'tenant_id' => $order->tenant_id,
                'order_id' => $order->id,
                'person_id' => $person?->id,
                'number' => $number,
                'type' => 'sale',
                'status' => 'posted',
                'issue_date' => ($order->created_at ?? now())->toDateString(),
                'subtotal_minor' => $subtotal,
                'discount_minor' => $discount,
                'tax_minor' => $taxTotal,
                'total_minor' => $total,
                'currency' => $order->currency ?: 'IRR',
                'moadian_pattern' => (int) ($buyerTax['invoice_pattern'] ?? $buyerTax['pattern'] ?? 1),
                'buyer_register_number' => (string) ($buyerTax['register_number'] ?? $buyerTax['registration_number'] ?? ''),
                'buyer_tax' => $buyerTax,
                'meta' => [
                    'order_number' => $order->number,
                    'order_status' => $order->status,
                    'sales_channel' => $order->sales_channel,
                ],
            ];

            if ($existing) {
                $existing->update($payload);
                AccInvoiceLine::query()->where('invoice_id', $existing->id)->delete();
                $invoice = $existing;
            } else {
                $invoice = AccInvoice::query()->create(array_merge($payload, [
                    'moadian_status' => null,
                ]));
            }

            foreach ($lines as $line) {
                AccInvoiceLine::query()->create(array_merge($line, ['invoice_id' => $invoice->id]));
            }

            $journal = $this->ensureSaleJournal($order, $invoice, $person);
            $invoice->update(['journal_id' => $journal->id]);

            return $invoice->fresh(['lines', 'order', 'person', 'journal']);
        });
    }

    public function syncIfNeeded(Order $order, ?string $from = null): ?AccInvoice
    {
        if (! $this->shouldSync($order->status)) {
            return null;
        }

        return $this->syncOrder($order);
    }

    private function upsertPerson(Order $order): ?AccPerson
    {
        $name = trim((string) ($order->customer_name ?: $order->customer_phone ?: ''));
        if ($name === '') {
            return null;
        }
        $buyerTax = is_array($order->buyer_tax) ? $order->buyer_tax : [];
        $phone = $order->customer_phone ? (string) $order->customer_phone : null;
        $national = (string) ($buyerTax['national_id'] ?? $buyerTax['nationalId'] ?? '');
        $economic = (string) ($buyerTax['economic_code'] ?? $buyerTax['economicCode'] ?? '');
        $type = (($buyerTax['person_type'] ?? $buyerTax['type'] ?? '') === 'legal') ? 'customer' : 'customer';

        $q = AccPerson::query()->where('tenant_id', $order->tenant_id);
        if ($phone) {
            $existing = (clone $q)->where('phone', $phone)->first();
        } elseif ($national !== '') {
            $existing = (clone $q)->where('national_id', $national)->first();
        } else {
            $existing = (clone $q)->where('name', $name)->first();
        }

        $data = [
            'tenant_id' => $order->tenant_id,
            'name' => $name,
            'type' => $type,
            'phone' => $phone,
            'national_id' => $national !== '' ? $national : null,
            'economic_code' => $economic !== '' ? $economic : null,
            'meta' => ['order_id' => $order->id, 'email' => $order->customer_email],
        ];

        if ($existing) {
            $existing->update($data);

            return $existing;
        }

        return AccPerson::query()->create($data);
    }

    private function ensureSaleJournal(Order $order, AccInvoice $invoice, ?AccPerson $person): AccJournal
    {
        $existing = AccJournal::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->where('source', 'order')
            ->first();

        $ar = $this->ensureAccount((int) $order->tenant_id, '1101', 'Accounts receivable', 'asset');
        $sales = $this->ensureAccount((int) $order->tenant_id, '4101', 'Sales revenue', 'revenue');
        $vat = $this->ensureAccount((int) $order->tenant_id, '2101', 'VAT payable', 'liability');

        $net = max(0, (int) $invoice->total_minor - (int) $invoice->tax_minor);
        $tax = (int) $invoice->tax_minor;
        $total = (int) $invoice->total_minor;
        $desc = 'Order '.$order->number.' → invoice '.$invoice->number.($person ? ' ('.$person->name.')' : '');

        $payload = [
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'number' => $existing?->number ?: ('ORD-'.$order->id.'-'.$invoice->id),
            'date' => $invoice->issue_date?->toDateString() ?? now()->toDateString(),
            'description' => $desc,
            'status' => 'posted',
            'source' => 'order',
            'total_debit_minor' => $total,
            'total_credit_minor' => $total,
        ];

        if ($existing) {
            $existing->update($payload);
            AccJournalLine::query()->where('journal_id', $existing->id)->delete();
            $journal = $existing;
        } else {
            $journal = AccJournal::query()->create($payload);
        }

        AccJournalLine::query()->create([
            'journal_id' => $journal->id,
            'account_code' => $ar->code,
            'account_name' => $ar->name,
            'debit_minor' => $total,
            'credit_minor' => 0,
        ]);
        AccJournalLine::query()->create([
            'journal_id' => $journal->id,
            'account_code' => $sales->code,
            'account_name' => $sales->name,
            'debit_minor' => 0,
            'credit_minor' => $net,
        ]);
        if ($tax > 0) {
            AccJournalLine::query()->create([
                'journal_id' => $journal->id,
                'account_code' => $vat->code,
                'account_name' => $vat->name,
                'debit_minor' => 0,
                'credit_minor' => $tax,
            ]);
        } elseif ($net !== $total) {
            // Keep journal balanced when tax is zero but totals differ by rounding.
            AccJournalLine::query()->where('journal_id', $journal->id)->where('account_code', $sales->code)
                ->update(['credit_minor' => $total]);
        }

        return $journal;
    }

    private function ensureAccount(int $tenantId, string $code, string $name, string $type): AccAccount
    {
        return AccAccount::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'code' => $code],
            ['name' => $name, 'type' => $type]
        );
    }

    private function nextInvoiceNumber(int $tenantId, Order $order): string
    {
        if ($order->number) {
            return 'INV-'.$order->number;
        }

        $n = AccInvoice::query()->where('tenant_id', $tenantId)->count() + 1;

        return 'INV-'.str_pad((string) $n, 6, '0', STR_PAD_LEFT);
    }
}
