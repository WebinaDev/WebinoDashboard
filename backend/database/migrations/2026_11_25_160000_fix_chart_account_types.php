<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Repair chart accounts that were created on demand with the wrong type.
 *
 * Before the chart shipped its four-digit accounts, posting to an unseeded code invented the
 * row with the name «حساب 6102» and the type `asset` — every code, whatever it was. A rent
 * payment then debited an *asset*, so the ledger balanced, the bank matched, and the profit and
 * loss reported no expenses at all. Nothing looked broken, which is exactly why it went unseen.
 *
 * This corrects the type and the name of every code the product now names, across all tenants.
 * It only touches rows whose type disagrees, so a shop that deliberately reclassified an
 * account by hand is not overturned — an accountant's decision outranks ours.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('acc_chart_accounts')) {
            return;
        }

        $named = \App\Services\Accounting\AccountCoding::namedCodes();

        foreach ($named as $code => $definition) {
            $rows = DB::table('acc_chart_accounts')->where('code', $code)->get(['id', 'name', 'type']);

            foreach ($rows as $row) {
                $updates = [];

                // `asset` was the blanket default, so only that one is evidence of the bug.
                if ((string) $row->type === 'asset' && $definition['type'] !== 'asset') {
                    $updates['type'] = $definition['type'];
                }

                // An auto-created placeholder name is replaced; a real name is left alone.
                $name = trim((string) $row->name);
                if ($name === '' || $name === 'حساب '.$code) {
                    $updates['name'] = $definition['name'];
                }

                if ($updates === []) {
                    continue;
                }

                // A postable placeholder also has to be postable after the fix; an account
                // created by posting to it always is, so this is belt and braces.
                $updates['is_postable'] = true;

                DB::table('acc_chart_accounts')->where('id', $row->id)->update($updates);
            }
        }
    }

    /**
     * No rollback: putting an expense back into assets would un-report the expenses the shops
     * have already filed on.
     */
    public function down(): void
    {
        // Intentionally empty.
    }
};
