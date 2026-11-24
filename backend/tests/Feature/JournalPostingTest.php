<?php

namespace Tests\Feature;

use App\Models\RoleCapability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Accounting\Entities\AccChartAccount;
use Modules\Accounting\Entities\AccFiscalYear;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Entities\AccJournalLine;
use Tests\TestCase;

/**
 * A journal posts only if it is a journal.
 *
 * `journal_post` used to be a status flip: an entry with one line, or with 500 debit against
 * 400 credit, posted without complaint and then sat in the trial balance as an imbalance no
 * report could explain — because nothing had ever refused it. These tests are the refusal.
 */
class JournalPostingTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $accountant;

    /** @var array<string, string> */
    private array $headers;

    private int $cashId;

    private int $salesId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'journals.test', 'slug' => 'journals']);
        $this->enableSubmodules($this->tenant->id, ['accounting.journals' => true]);

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

        $this->cashId = (int) AccChartAccount::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => '1010',
            'name' => 'صندوق',
            'type' => 'asset',
            'is_postable' => true,
        ])->id;

        $this->salesId = (int) AccChartAccount::query()->create([
            'tenant_id' => $this->tenant->id,
            'code' => '4010',
            'name' => 'درآمد فروش',
            'type' => 'revenue',
            'is_postable' => true,
        ])->id;
    }

    /** @param list<array{debit?: float, credit?: float}> $lines */
    private function draft(array $lines): AccJournalEntry
    {
        $entry = AccJournalEntry::query()->create([
            'tenant_id' => $this->tenant->id,
            'document_date' => now()->toDateString(),
            'description' => 'آزمون',
            'status' => 'draft',
        ]);

        foreach ($lines as $index => $line) {
            AccJournalLine::query()->create([
                'tenant_id' => $this->tenant->id,
                'journal_entry_id' => $entry->id,
                'account_id' => $index === 0 ? $this->cashId : $this->salesId,
                'debit' => $line['debit'] ?? 0,
                'credit' => $line['credit'] ?? 0,
            ]);
        }

        return $entry;
    }

    private function post(AccJournalEntry $entry)
    {
        return $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/journal_post', ['id' => $entry->id]);
    }

    public function test_a_balanced_entry_posts(): void
    {
        $entry = $this->draft([['debit' => 100], ['credit' => 100]]);

        $this->post($entry)->assertOk();

        $this->assertSame('posted', (string) $entry->fresh()->status);
    }

    public function test_an_unbalanced_entry_is_refused(): void
    {
        $entry = $this->draft([['debit' => 500], ['credit' => 400]]);

        $this->post($entry)->assertStatus(422);

        $this->assertSame('draft', (string) $entry->fresh()->status, 'a refused entry must stay a draft');
    }

    public function test_a_one_line_entry_is_refused(): void
    {
        $entry = $this->draft([['debit' => 100]]);

        $this->post($entry)->assertStatus(422);

        $this->assertSame('draft', (string) $entry->fresh()->status);
    }

    /** A line cannot be both sides at once: it always balances wrongly and never visibly. */
    public function test_a_line_that_is_both_debit_and_credit_is_refused(): void
    {
        $entry = $this->draft([['debit' => 100, 'credit' => 100], ['debit' => 0, 'credit' => 0]]);

        $this->post($entry)->assertStatus(422);

        $this->assertSame('draft', (string) $entry->fresh()->status);
    }

    public function test_a_posted_entry_cannot_be_deleted(): void
    {
        $entry = $this->draft([['debit' => 100], ['credit' => 100]]);
        $this->post($entry)->assertOk();

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/journal_delete', ['id' => $entry->id])
            ->assertStatus(422);

        $this->assertNotNull($entry->fresh(), 'removing a posted entry would rewrite every report that counted it');
    }

    public function test_a_draft_can_be_deleted(): void
    {
        $entry = $this->draft([['debit' => 100], ['credit' => 100]]);

        $this->actingAs($this->accountant)
            ->withHeaders($this->headers)
            ->postJson('/api/v1/erp-accounting/wp-action/journal_delete', ['id' => $entry->id])
            ->assertOk();

        $this->assertNull($entry->fresh());
    }
}
