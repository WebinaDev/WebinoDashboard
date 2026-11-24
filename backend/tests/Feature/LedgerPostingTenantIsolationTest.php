<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Services\LedgerPosting;
use Tests\TestCase;

class LedgerPostingTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_background_postings_use_only_the_specified_tenant(): void
    {
        $first = $this->createTenant(['slug' => 'site-001', 'domain' => 'site-001.example.local']);
        $second = $this->createTenant(['slug' => 'site-002', 'domain' => 'site-002.example.local']);
        $posting = app(LedgerPosting::class);
        $lines = [['code' => '1102', 'debit' => 100], ['code' => '2102', 'credit' => 100]];

        $firstEntry = $posting->post($lines, ['tenant_id' => $first->id]);
        $secondEntry = $posting->post($lines, ['tenant_id' => $second->id]);

        foreach ([$firstEntry, $secondEntry] as $entry) {
            $this->assertSame(2, DB::table('acc_journal_lines')
                ->join('acc_chart_accounts', 'acc_chart_accounts.id', '=', 'acc_journal_lines.account_id')
                ->where('acc_journal_lines.journal_entry_id', $entry->id)
                ->where('acc_journal_lines.tenant_id', $entry->tenant_id)
                ->where('acc_chart_accounts.tenant_id', $entry->tenant_id)
                ->count());
        }
        $this->assertDatabaseCount('acc_chart_accounts', 4);
    }

    public function test_posting_rejects_a_different_authenticated_tenant(): void
    {
        $first = $this->createTenant(['slug' => 'site-001', 'domain' => 'site-001.example.local']);
        $second = $this->createTenant(['slug' => 'site-002', 'domain' => 'site-002.example.local']);
        $this->actingAs(User::factory()->create(['tenant_id' => $first->id]));

        $this->expectException(\InvalidArgumentException::class);
        try {
            app(LedgerPosting::class)->post(
                [['code' => '1102', 'debit' => 100], ['code' => '2102', 'credit' => 100]],
                ['tenant_id' => $second->id],
            );
        } finally {
            $this->assertDatabaseCount('acc_journal_entries', 0);
            $this->assertDatabaseCount('acc_chart_accounts', 0);
        }
    }
}
