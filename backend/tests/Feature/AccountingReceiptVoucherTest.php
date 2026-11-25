<?php

namespace Tests\Feature;

use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Accounting\Entities\AccCashAccount;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccReceiptVoucher;
use Modules\Accounting\Services\LedgerPosting;
use Tests\TestCase;

/**
 * Receipts and payments: the two endpoints the accounting screen actually calls.
 *
 * These tests exist because of a specific failure that shipped: `AccReceipts.tsx` posted
 * `receipt_save` / `receipt_post` / `receipt_delete`, the service only knew
 * `receipt_voucher_*`, and the catch-all in the match returned `['ok' => true]`. The screen
 * showed a success toast and wrote nothing, and posting a voucher moved no ledger at all.
 *
 * Every assertion here is about a row that either exists or does not.
 */
class AccountingReceiptVoucherTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $accountant;

    /** @var array<string, string> */
    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'receipts.test', 'slug' => 'receipts']);
        $this->enableSubmodules($this->tenant->id, ['commerce.accounting' => true, 'accounting.receipts' => true, 'accounting.journals' => true]);

        RoleCapability::query()->firstOrCreate([
            'tenant_id' => $this->tenant->id,
            'role' => 'accountant',
            'capability' => 'accounting.manage',
        ]);

        $this->accountant = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'accountant',
        ]);

        $this->headers = ['X-Tenant-Domain' => $this->tenant->domain];

        AccFiscalYear::query()->create([
            'tenant_id' => $this->tenant->id,
            'title' => '۱۴۰۵',
            'starts_on' => now()->startOfYear()->toDateString(),
            'ends_on' => now()->endOfYear()->toDateString(),
        ]);
    }

    /** The screen's action name must reach the same code as the legacy one. */
    public function test_the_dashboard_action_name_saves_a_voucher(): void
    {
        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_save', [
                'type' => 'receipt',
                'number' => '1001',
                'date' => now()->toDateString(),
                'amount' => 250000,
                'description' => 'فروش نقدی',
            ])
            ->assertOk()
            ->assertJsonPath('data.voucher.number', '1001');

        $this->assertSame(1, AccReceiptVoucher::query()->where('number', '1001')->count());
        $this->assertSame(
            '250000.00',
            (string) AccReceiptVoucher::query()->where('number', '1001')->value('amount'),
        );
    }

    /** The form posts `date`; the column is `document_date`. Both must land. */
    public function test_the_form_date_field_is_stored_as_the_document_date(): void
    {
        $date = now()->subDays(3)->toDateString();

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_save', [
                'type' => 'receipt',
                'number' => '1002',
                'date' => $date,
                'amount' => 1000,
            ])
            ->assertOk();

        $row = AccReceiptVoucher::query()->where('number', '1002')->firstOrFail();
        $this->assertSame($date, $row->document_date?->toDateString());
    }

    /**
     * Posting must actually cut a journal.
     *
     * Before this, `receipt_post` flipped `status` and nothing else — the voucher list showed
     * money the ledger had never seen.
     */
    public function test_posting_a_receipt_creates_a_balanced_journal_and_links_it(): void
    {
        $account = AccCashAccount::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'صندوق اصلی',
            'type' => 'cash',
            'chart_code' => '111',
            'is_active' => true,
        ]);

        $voucher = AccReceiptVoucher::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'receipt',
            'number' => '2001',
            'cash_account_id' => $account->id,
            'amount' => 300000,
            'document_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_post', ['id' => $voucher->id])
            ->assertOk();

        $voucher->refresh();
        $this->assertSame('posted', $voucher->status);
        $this->assertNotNull($voucher->journal_entry_id, 'the voucher has to point at its journal');

        $entry = AccJournalEntry::query()->findOrFail($voucher->journal_entry_id);
        $debit = (float) $entry->lines()->sum('debit');
        $credit = (float) $entry->lines()->sum('credit');
        $this->assertSame(300000.0, $debit);
        $this->assertSame($debit, $credit, 'a posted journal is always balanced');
        $this->assertSame(2, $entry->lines()->count());
    }

    /** A payment must not be posted as money coming in. */
    public function test_a_payment_voucher_is_posted_in_the_opposite_direction(): void
    {
        $account = AccCashAccount::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'بانک ملت',
            'type' => 'bank',
            'chart_code' => '112',
            'is_active' => true,
        ]);

        $voucher = AccReceiptVoucher::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'payment',
            'number' => '3001',
            'cash_account_id' => $account->id,
            'amount' => 50000,
            'document_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        app(LedgerPosting::class)->postVoucher($voucher);

        $entry = AccJournalEntry::query()->findOrFail($voucher->fresh()->journal_entry_id);
        $bankLine = $entry->lines()->whereHas('account', fn ($q) => $q->where('code', '112'))->firstOrFail();

        $this->assertSame(0.0, (float) $bankLine->debit, 'paying out credits the bank');
        $this->assertSame(50000.0, (float) $bankLine->credit);
    }

    /** Posting twice must not double the books. */
    public function test_posting_the_same_voucher_twice_is_refused(): void
    {
        $voucher = AccReceiptVoucher::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'receipt',
            'number' => '4001',
            'amount' => 1000,
            'document_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_post', ['id' => $voucher->id])
            ->assertOk();

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_post', ['id' => $voucher->id])
            ->assertStatus(422);

        $this->assertSame(1, AccJournalEntry::query()->count());
    }

    /** A posted voucher is immutable; editing it would change money already in the ledger. */
    public function test_a_posted_voucher_cannot_be_edited(): void
    {
        $voucher = AccReceiptVoucher::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'receipt',
            'number' => '5001',
            'amount' => 1000,
            'document_date' => now()->toDateString(),
            'status' => 'posted',
        ]);

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_save', [
                'id' => $voucher->id,
                'type' => 'receipt',
                'amount' => 999999,
            ])
            ->assertStatus(422);
    }

    /** An unknown action must fail loudly instead of pretending to succeed. */
    public function test_an_unknown_action_is_rejected_rather_than_answered_with_ok(): void
    {
        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_voucher_save_typo', ['amount' => 1])
            ->assertStatus(404);
    }

    /** A closed fiscal year is closed: no back-dated posting may land in it. */
    public function test_a_posting_dated_inside_a_closed_year_is_refused(): void
    {
        AccFiscalYear::query()->update(['is_closed' => true]);

        $voucher = AccReceiptVoucher::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'receipt',
            'number' => '6001',
            'amount' => 1000,
            'document_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/receipt_post', ['id' => $voucher->id])
            ->assertStatus(422);

        $this->assertSame(0, AccJournalEntry::query()->count());
        $this->assertSame('draft', $voucher->fresh()->status);
    }

    /** The ledger poster refuses to write an unbalanced entry at all. */
    public function test_the_poster_rejects_an_unbalanced_journal(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        app(LedgerPosting::class)->post([
            ['code' => '111', 'debit' => 100],
            ['code' => '113', 'credit' => 90],
        ]);
    }
}
