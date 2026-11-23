<?php

namespace App\Services\Accounting;

use App\Models\AccAccount;
use App\Models\AccAccountCoding;
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
        $order->loadMissing('items.product', 'items.variant', 'payments');

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

    /**
     * Post the sales journal: debit what was actually received, credit revenue and VAT,
     * then recognise cost of goods.
     *
     * Before account coding existed this posted the whole total to receivables and stopped
     * there, so a cash sale inflated AR and no margin ever reached the ledger. The shape now:
     *
     *   Dr  cash / bank / AR per tender      (split by OrderPayments, not one lump)
     *   Dr  discount                         (when a discount was given)
     *   Cr  sales revenue                    (net of tax and discount)
     *   Cr  VAT payable
     *   Dr  COGS / Cr inventory              (only when the cost of every line is known)
     *
     * Anything the order cannot settle identically — an unpaid order that is still "processing"
     * — leaves the remainder on receivables, which is the true position.
     */
    private function ensureSaleJournal(Order $order, AccInvoice $invoice, ?AccPerson $person): AccJournal
    {
        $tenantId = (int) $order->tenant_id;
        $coding = app(AccountCoding::class);
        // Create any account the tenant mapped but has not yet added to their chart, so a
        // mapping saved first and a chart edited later cannot break posting.
        $accounts = $coding->ensureAccounts($tenantId);

        $existing = AccJournal::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('order_id', $order->id)
            ->where('source', 'order')
            ->first();

        $tax = (int) $invoice->tax_minor;
        $total = (int) $invoice->total_minor;
        $discount = max(0, (int) ($invoice->discount_minor ?? 0));
        // Revenue excludes what the guest was charged for delivery; shipping is its own line.
        $shipping = $this->shippingMinor($order);
        // `invoice.total_minor` is already net of discount, so gross revenue is total - tax -
        // shipping + discount. Crediting gross and debiting the discount separately keeps the
        // discount visible in the ledger instead of vanishing into a smaller revenue figure.
        $gross = max(0, $total - $tax - $shipping + $discount);

        $desc = 'Order '.$order->number.' → invoice '.$invoice->number.($person ? ' ('.$person->name.')' : '');

        $payload = [
            'tenant_id' => $order->tenant_id,
            'order_id' => $order->id,
            'number' => $existing?->number ?: ('ORD-'.$order->id.'-'.$invoice->id),
            'date' => $invoice->issue_date?->toDateString() ?? now()->toDateString(),
            'description' => $desc,
            'status' => 'posted',
            'source' => 'order',
            'total_debit_minor' => 0,
            'total_credit_minor' => 0,
        ];

        if ($existing) {
            $existing->update($payload);
            AccJournalLine::query()->where('journal_id', $existing->id)->delete();
            $journal = $existing;
        } else {
            $journal = AccJournal::query()->create($payload);
        }

        $debit = 0;
        $credit = 0;

        $line = function (AccAccount $account, int $dr, int $cr) use ($journal, &$debit, &$credit): void {
            if ($dr === 0 && $cr === 0) {
                return;
            }
            AccJournalLine::query()->create([
                'journal_id' => $journal->id,
                'account_code' => $account->code,
                'account_name' => $account->name,
                'debit_minor' => $dr,
                'credit_minor' => $cr,
            ]);
            $debit += $dr;
            $credit += $cr;
        };

        // 1. Credit side: gross revenue, shipping, VAT.
        $line($accounts[AccAccountCoding::ROLE_SALES], 0, $gross);
        if ($shipping > 0) {
            $line($accounts[AccAccountCoding::ROLE_SHIPPING], 0, $shipping);
        }
        if ($tax > 0) {
            $line($accounts[AccAccountCoding::ROLE_VAT], 0, $tax);
        }

        // 2. Debit side: the discount given, then tenders received, then what is still owed.
        if ($discount > 0) {
            $line($accounts[AccAccountCoding::ROLE_DISCOUNT], $discount, 0);
        }
        $settled = $this->tenderSplit($order, $accounts, $line);
        $outstanding = max(0, $total - $settled);
        if ($outstanding > 0) {
            $line($accounts[AccAccountCoding::ROLE_AR], $outstanding, 0);
        }

        // 3. Cost of goods. Skipped entirely when any sold line has no captured cost, because
        //    posting a partial COGS silently overstates margin for the rest of the basket.
        $cogs = $this->costOfGoods($order);
        if ($cogs !== null && $cogs > 0 && isset($accounts[AccAccountCoding::ROLE_COGS])) {
            $line($accounts[AccAccountCoding::ROLE_COGS], $cogs, 0);
            $line($accounts[AccAccountCoding::ROLE_INVENTORY], 0, $cogs);
        }

        $journal->update([
            'total_debit_minor' => $debit,
            'total_credit_minor' => $credit,
        ]);

        return $journal;
    }

    /**
     * Debit each tender into the account it actually lands in.
     *
     * @param  array<string, AccAccount>  $accounts
     * @param  callable(AccAccount, int, int): void  $line
     * @return int total settled, capped at the invoice total
     */
    private function tenderSplit(Order $order, array $accounts, callable $line): int
    {
        $payments = $order->relationLoaded('payments')
            ? $order->payments
            : $order->payments()->get();

        if ($payments->isEmpty()) {
            return 0;
        }

        $total = (int) ($order->total_minor ?? 0);
        $settled = 0;

        foreach ($payments as $payment) {
            $amount = (int) $payment->amount_minor;
            if ($amount <= 0) {
                continue;
            }
            // Never settle more than the sale; a rounding over-payment stays off the journal.
            if ($total > 0 && $settled + $amount > $total) {
                $amount = max(0, $total - $settled);
            }
            if ($amount === 0) {
                break;
            }

            $key = 'tender:'.$payment->tender;
            $account = $accounts[$key] ?? $accounts[AccAccountCoding::ROLE_AR];
            $line($account, $amount, 0);
            $settled += $amount;
        }

        return $settled;
    }

    /**
     * Cost of the sold units, or null when any line's cost is unknown.
     *
     * Cost is read from the line snapshot, falling back to the catalogue for lines written
     * before the snapshot column existed. The add-on delta is removed first: an add-on is
     * priced at its own margin, and most have no purchase cost of their own.
     */
    private function costOfGoods(Order $order): ?int
    {
        $order->loadMissing('items.product', 'items.variant');
        $total = 0;

        foreach ($order->items as $item) {
            $qty = (int) $item->quantity;
            if ($qty <= 0) {
                continue;
            }

            $unitCost = $item->unit_cost_minor;
            if ($unitCost === null) {
                $unitCost = $item->variant?->purchase_price_minor
                    ?? $item->product?->purchase_price_minor;
            }

            // A single unknown cost invalidates the whole figure; a zero would look like free
            // goods and quietly flatter the margin.
            if ($unitCost === null) {
                return null;
            }

            $total += (int) $unitCost * $qty;
        }

        return $total;
    }

    /** What the guest was charged for delivery. */
    private function shippingMinor(Order $order): int
    {
        return max(0, (int) ($order->shipping_minor ?? 0));
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
