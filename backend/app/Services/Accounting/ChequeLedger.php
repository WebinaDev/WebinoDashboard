<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccJournalEntry;
use Modules\Accounting\Services\LedgerPosting;

/**
 * What a cheque does to the books, at each moment it matters.
 *
 * Changing `acc_checks.status` used to change nothing else, so:
 *
 *  - a customer's cheque stayed inside receivables until it cleared (it should be a separate
 *    asset the moment it is handed over, because a cheque in a drawer is not money yet);
 *  - a cheque that bounced left the bank balance as if it had been paid;
 *  - a supplier's cheque was never subtracted from payables at all.
 *
 * The chart codes are conventional and deliberate:
 *
 *   1104  cheques in hand (receivable)        2106  cheques payable (issued)
 *
 * Two invariants:
 *
 *  - **Each movement posts once.** A status change that would re-post the same movement is
 *    refused rather than doubled, because a doubled cheque book is worse than a wrong one.
 *  - **A bounce reopens the debt.** Reversing a cheque means putting the obligation back where
 *    it came from — receivable for a customer's cheque, payable for the shop's own.
 */
final class ChequeLedger
{
    /** Movements a cheque can make, and the statuses that mean "this happened". */
    private const RECEIVABLE_FLOW = [
        // A cheque in a drawer is not money: the debt moves out of receivables into a named
        // asset the moment it is handed over, and only becomes cash when the bank clears it.
        'issued' => 'receive',
        'deposited' => null,              // handed to the bank: already in cheques-in-hand
        'cleared' => 'clear',             // the bank took the money
        'bounced' => 'bounce',            // the bank gave it back
        'returned' => 'return',           // given back to the customer before depositing
    ];

    private const PAYABLE_FLOW = [
        'issued' => 'issue',              // the shop wrote it
        'deposited' => 'deposit',
        'cleared' => 'clear',
        'bounced' => 'bounce',
        'returned' => 'return',
    ];

    /**
     * The older screen speaks a different vocabulary: pending / collected / spent / returned.
     *
     * Rather than break it — or, worse, let it write a status the ledger does not understand —
     * the aliases are translated here, once, and the canonical names are what get stored.
     * `spent` is a payable cheque the bank paid, `collected` a receivable one.
     */
    private const ALIASES = [
        'pending' => 'issued',
        'collected' => 'cleared',
        'spent' => 'cleared',
        'cancelled' => 'returned',
    ];

    public function __construct(
        private readonly LedgerPosting $ledger,
        private readonly AccountCoding $coding,
    ) {}

    public static function canonical(?string $status): string
    {
        $value = trim((string) $status);

        return self::ALIASES[$value] ?? $value;
    }

    public const CHEQUES_IN_HAND = '1104';
    public const CHEQUES_PAYABLE = '2106';

    /**
     * Record a cheque and post the movement that recording it implies.
     *
     * A cheque handed over the counter is a fact the moment it is written down, so the receipt
     * is posted here rather than waiting for someone to change a status later. A row created
     * straight into a later status posts that status's movement instead of two.
     */
    public function record(int $tenantId, int $checkId, ?int $userId = null): void
    {
        $check = DB::table('acc_checks')->where('tenant_id', $tenantId)->where('id', $checkId)->first();

        if ($check === null || (float) $check->amount <= 0) {
            return;
        }

        if ($check->journal_entry_id !== null) {
            return;
        }

        $payable = (string) $check->type === 'payable';

        // `issued` is the shape a newly written cheque has; anything later posts its own flow.
        $movement = ($payable ? self::PAYABLE_FLOW : self::RECEIVABLE_FLOW)[self::canonical((string) $check->status)] ?? null;

        if ($movement === null) {
            return;
        }

        $this->postMovement($tenantId, $payable, $movement, (float) $check->amount, null, $userId, $checkId);
    }

    /**
     * Change a cheque's status and post the movement it implies.
     *
     * @return array<string, mixed> the refreshed cheque
     */
    public function setStatus(
        int $tenantId,
        int $checkId,
        string $status,
        ?string $note = null,
        ?int $userId = null,
    ): array {
        $check = DB::table('acc_checks')->where('tenant_id', $tenantId)->where('id', $checkId)->first();

        if ($check === null) {
            throw ValidationException::withMessages(['check' => __('api.check_not_found')]);
        }

        $status = self::canonical($status);
        $from = self::canonical((string) $check->status);
        $payable = (string) $check->type === 'payable';

        if ($from === $status) {
            return (array) $check;
        }

        if ($status === 'bounced' && trim((string) $note) === '') {
            // A bounce with no reason cannot be chased. The field exists for exactly this.
            throw ValidationException::withMessages(['bounced_reason' => __('api.check_bounce_needs_reason')]);
        }

        $movement = ($payable ? self::PAYABLE_FLOW : self::RECEIVABLE_FLOW)[$status] ?? null;
        $amount = (float) $check->amount;

        // A cheque recorded as already cleared never passed through the drawer in this system.
        // Without this the clearing would credit an asset that was never debited, and the
        // balance sheet would show a negative cheque book no one can explain.
        $backfill = ! $payable
            && in_array($movement, ['clear', 'bounce', 'return'], true)
            && (int) ($check->journal_entry_id ?? 0) === 0
            && $amount > 0;

        DB::transaction(function () use ($tenantId, $checkId, $status, $from, $payable, $movement, $amount, $note, $userId, $backfill): void {
            if ($backfill) {
                $this->postMovement($tenantId, false, 'receive', $amount, null, $userId, $checkId);
            }

            if ($movement !== null && $amount > 0) {
                $this->postMovement($tenantId, $payable, $movement, $amount, $note, $userId, $checkId);
            }

            $update = ['status' => $status, 'updated_at' => now()];

            // Only the fields this transition actually decides; a cleared cheque must not
            // blank the reason recorded when it bounced last month.
            if ($status === 'bounced') {
                $update['bounced_reason'] = $note === null ? null : trim($note);
            }

            if ($status === 'cleared') {
                $update['settled_on'] = now()->toDateString();
                $update['settled_amount'] = $amount;
            }

            DB::table('acc_checks')->where('id', $checkId)->update($update);
        });

        return (array) DB::table('acc_checks')->where('id', $checkId)->first();
    }

    private function postMovement(
        int $tenantId,
        bool $payable,
        string $movement,
        float $amount,
        ?string $note,
        ?int $userId,
        int $checkId,
    ): void {
        $roles = $this->coding->get($tenantId)['roles'];
        $cash = (string) ($roles['cash'] ?? '1102');
        $bank = (string) ($roles['bank'] ?? '1103');
        $ar = (string) ($roles['ar'] ?? '1101');
        $ap = (string) ($roles['ap'] ?? '2102');

        $lines = [];
        $description = __('api.check_status_change', ['status' => $movement]);

        if ($payable) {
            $lines = match ($movement) {
                // Writing a cheque moves a payable from "owed to the supplier" to "owed to the
                // bank": the debt does not disappear until the cheque clears.
                'issue' => [
                    ['code' => $ap, 'debit' => $amount],
                    ['code' => self::CHEQUES_PAYABLE, 'credit' => $amount],
                ],
                'clear' => [
                    ['code' => self::CHEQUES_PAYABLE, 'debit' => $amount],
                    ['code' => $bank, 'credit' => $amount],
                ],
                // A bounced cheque puts the debt back to the supplier.
                'bounce' => [
                    ['code' => self::CHEQUES_PAYABLE, 'debit' => $amount],
                    ['code' => $ap, 'credit' => $amount],
                ],
                'return' => [
                    ['code' => self::CHEQUES_PAYABLE, 'debit' => $amount],
                    ['code' => $ap, 'credit' => $amount],
                ],
                default => [],
            };
        } else {
            $lines = match ($movement) {
                // Receiving a cheque takes the debt out of receivables and into a named asset.
                'receive' => [
                    ['code' => self::CHEQUES_IN_HAND, 'debit' => $amount],
                    ['code' => $ar, 'credit' => $amount],
                ],
                'deposit' => [
                    ['code' => self::CHEQUES_IN_HAND, 'debit' => $amount],
                    ['code' => $ar, 'credit' => $amount],
                ],
                'clear' => [
                    ['code' => $bank, 'debit' => $amount],
                    ['code' => self::CHEQUES_IN_HAND, 'credit' => $amount],
                ],
                // Bounced: the guest owes it again, and there is a bank fee to chase separately.
                'bounce' => [
                    ['code' => $ar, 'debit' => $amount],
                    ['code' => self::CHEQUES_IN_HAND, 'credit' => $amount],
                ],
                'return' => [
                    ['code' => $ar, 'debit' => $amount],
                    ['code' => self::CHEQUES_IN_HAND, 'credit' => $amount],
                ],
                default => [],
            };
        }

        if ($lines === []) {
            return;
        }

        foreach ($lines as $index => $line) {
            $lines[$index]['description'] = $description;
        }

        $entry = AccJournalEntry::withoutTenancy(fn (): AccJournalEntry => $this->ledger->post(
            $lines,
            [
                'tenant_id' => $tenantId,
                'document_date' => now()->toDateString(),
                'description' => $description.($note ? ' — '.$note : ''),
                'status' => 'posted',
                'created_by' => $userId,
            ],
        ));

        DB::table('acc_checks')->where('id', $checkId)->update(['journal_entry_id' => $entry->id]);
    }
}
