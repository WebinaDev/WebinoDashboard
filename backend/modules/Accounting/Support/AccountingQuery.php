<?php

namespace Modules\Accounting\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

/**
 * Entry point for reporting queries that need more than one `acc_*` table.
 *
 * Reports (trial balance, balance sheet, P&L, ledger) join `acc_journal_lines` to
 * `acc_journal_entries` and `acc_chart_accounts` and select a handful of columns, so the
 * ERP writes them against the query builder rather than a model. A query builder has no
 * global scope, which in a single-tenant ERP is fine and here is a silent cross-tenant
 * leak: the report totals would include every shop's ledger.
 *
 * Use {@see self::journalLines()} instead of `DB::table('acc_journal_lines as jl')`.
 * It applies the tenant filter to the line table itself, which is sufficient — lines
 * reach their entry and their account by foreign key, so filtering the line table
 * filters the join.
 */
final class AccountingQuery
{
    /**
     * Tenant-scoped `acc_journal_lines as jl` builder, ready for the standard joins.
     *
     * The alias is part of the contract: every caller joins on `jl.journal_entry_id`
     * and `jl.account_id`.
     */
    public static function journalLines(): Builder
    {
        return BelongsToTenant::scopeTenant(DB::table('acc_journal_lines as jl'), 'jl');
    }
}
