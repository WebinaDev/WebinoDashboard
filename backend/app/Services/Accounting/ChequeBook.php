<?php

namespace App\Services\Accounting;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccCheck;
use Modules\Accounting\Entities\AccChequeBook;
use Modules\Accounting\Entities\AccChequeLeaf;

/**
 * A cheque book as an object you can lose control of.
 *
 * The shop already records cheques; this records the *leaves*, which is where the control lives.
 * The difference matters on the day a book does not reconcile: counting issued cheques tells you
 * eleven were written, and counting leaves tells you the book has fourteen missing — which is the
 * number the bank asks for when you stop payment.
 *
 * Three rules, each learned from how a real book goes wrong:
 *
 *  - **A leaf is used once.** Two live cheques cannot share a serial, so taking a leaf writes its
 *    status and the database refuses a second take. A cancelled or lost leaf stays cancelled:
 *    the number is consumed, because the bank will honour the paper whoever is holding it.
 *  - **The range is the truth.** Leaves are created from the printed serial range, and asking
 *    for a number outside it is refused rather than quietly added — a typo in a serial is how a
 *    book ends up claiming a leaf the bank gave to another customer.
 *  - **Issuing a cheque is one step.** The leaf and the `acc_checks` row are written in one
 *    transaction, so there is never a written cheque with no leaf behind it (which is exactly
 *    the state that makes a book unreconcilable).
 */
final class ChequeBook
{
    /**
     * Create the book and its leaves from the printed range.
     *
     * @param  array{title: string, bank?: ?string, series_from: int|string, series_to: int|string, void_from?: ?int, void_to?: ?int, cash_account_id?: ?int, notes?: ?string}  $data
     */
    public function open(int $tenantId, array $data, ?int $userId = null): AccChequeBook
    {
        $from = $this->toSerial($data['series_from'] ?? null);
        $to = $this->toSerial($data['series_to'] ?? null);

        if ($from === null || $to === null) {
            throw ValidationException::withMessages([
                'series_from' => 'شماره شروع و پایان دسته چک باید عدد باشد.',
            ]);
        }

        if ($to < $from) {
            throw ValidationException::withMessages([
                'series_from' => 'شماره پایان نمی‌تواند کوچک‌تر از شماره شروع باشد.',
            ]);
        }

        // A book of a hundred thousand leaves is a typo, not a book. Refusing keeps the leaf
        // table from being filled by one mistyped digit.
        $count = $to - $from + 1;
        if ($count > 200) {
            throw ValidationException::withMessages([
                'series_to' => sprintf('تعداد برگ‌های یک دسته چک بیش از ۲۰۰ برگ است (%d)؛ شماره‌ها را بررسی کنید.', $count),
            ]);
        }

        $voidFrom = isset($data['void_from']) && $data['void_from'] !== null ? (int) $data['void_from'] : null;
        $voidTo = isset($data['void_to']) && $data['void_to'] !== null ? (int) $data['void_to'] : null;

        return DB::transaction(function () use ($tenantId, $data, $userId, $from, $to, $voidFrom, $voidTo): AccChequeBook {
            $book = AccChequeBook::query()->create([
                'tenant_id' => $tenantId,
                'cash_account_id' => $data['cash_account_id'] ?? null,
                'title' => (string) $data['title'],
                'bank' => $data['bank'] ?? null,
                'series_from' => (string) $from,
                'series_to' => (string) $to,
                'void_from' => $voidFrom,
                'void_to' => $voidTo,
                'is_active' => true,
                'notes' => $data['notes'] ?? null,
                'created_by' => $userId,
            ]);

            $rows = [];
            for ($n = $from; $n <= $to; $n++) {
                // Leaves the bank voided are 'cancelled' from the start: they are in the book,
                // they will never be money, and pretending they do not exist makes the count
                // disagree with the paper.
                $voided = $voidFrom !== null && $voidTo !== null && $n >= $voidFrom && $n <= $voidTo;

                $rows[] = [
                    'tenant_id' => $tenantId,
                    'cheque_book_id' => $book->id,
                    'leaf_number' => $n,
                    'status' => $voided ? AccChequeLeaf::CANCELLED : AccChequeLeaf::UNUSED,
                    'note' => $voided ? 'برگ باطل‌شدهٔ بانک' : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            AccChequeLeaf::query()->insert($rows);

            return $book->fresh(['leaves']);
        });
    }

    /**
     * Write a cheque on a specific leaf.
     *
     * @param  array{leaf_number: int, amount: float, person_id?: ?int, due_date?: ?string, note?: ?string, type?: string}  $data
     */
    public function issue(int $tenantId, int $bookId, array $data, ?int $userId = null): array
    {
        $book = AccChequeBook::query()->where('tenant_id', $tenantId)->findOrFail($bookId);

        if (! $book->is_active) {
            throw ValidationException::withMessages([
                'cheque_book_id' => 'این دسته چک بسته شده است؛ صدور چک روی آن مجاز نیست.',
            ]);
        }

        $leafNumber = (int) ($data['leaf_number'] ?? 0);
        $amount = round((float) ($data['amount'] ?? 0), 2);

        if ($amount <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'مبلغ چک باید بزرگ‌تر از صفر باشد.',
            ]);
        }

        $leaf = AccChequeLeaf::query()
            ->where('cheque_book_id', $book->id)
            ->where('leaf_number', $leafNumber)
            ->first();

        if (! $leaf) {
            throw ValidationException::withMessages([
                'leaf_number' => sprintf(
                    'برگ %d در این دسته چک نیست (از %s تا %s).',
                    $leafNumber,
                    $book->series_from,
                    $book->series_to,
                ),
            ]);
        }

        // Re-taking a leaf is the one thing that must never happen quietly: the serial is the
        // only identity a cheque has when it comes back from the bank months later.
        if ($leaf->status !== AccChequeLeaf::UNUSED) {
            throw ValidationException::withMessages([
                'leaf_number' => sprintf(
                    'برگ %d قبلاً استفاده شده است (%s).',
                    $leafNumber,
                    $this->statusLabel((string) $leaf->status),
                ),
            ]);
        }

        return DB::transaction(function () use ($tenantId, $book, $leaf, $leafNumber, $amount, $data, $userId): array {
            $check = AccCheck::query()->create([
                'tenant_id' => $tenantId,
                'type' => $data['type'] ?? 'payable',
                'number' => (string) $leafNumber,
                'bank' => $book->bank,
                'amount' => $amount,
                'due_date' => $data['due_date'] ?? null,
                'status' => 'issued',
                'cash_account_id' => $book->cash_account_id,
                'person_id' => $data['person_id'] ?? null,
                'cheque_book_id' => $book->id,
            ]);

            $leaf->update([
                'status' => AccChequeLeaf::ISSUED,
                'check_id' => $check->id,
                'person_id' => $data['person_id'] ?? null,
                'amount' => $amount,
                'due_date' => $data['due_date'] ?? null,
                'issued_on' => now()->toDateString(),
                'note' => $data['note'] ?? null,
            ]);

            // The cheque now exists as a fact, so its entry posts now rather than waiting for
            // somebody to remember to change a status next week.
            app(ChequeLedger::class)->record($tenantId, (int) $check->id, $userId);

            return ['check' => $check->fresh(['person', 'cashAccount']), 'leaf' => $leaf->fresh()];
        });
    }

    /**
     * Mark a leaf cancelled or lost.
     *
     * Both are terminal and both consume the number: the bank will honour the paper whoever
     * holds it, so the shop's own record must stop claiming that serial is free.
     */
    public function spoil(int $tenantId, int $bookId, int $leafNumber, string $status, ?string $note = null): AccChequeLeaf
    {
        if (! in_array($status, [AccChequeLeaf::CANCELLED, AccChequeLeaf::LOST], true)) {
            throw ValidationException::withMessages([
                'status' => 'وضعیت فقط می‌تواند «باطل» یا «مفقود» باشد.',
            ]);
        }

        $book = AccChequeBook::query()->where('tenant_id', $tenantId)->findOrFail($bookId);

        $leaf = AccChequeLeaf::query()
            ->where('cheque_book_id', $book->id)
            ->where('leaf_number', $leafNumber)
            ->firstOrFail();

        if ($leaf->status === AccChequeLeaf::ISSUED) {
            throw ValidationException::withMessages([
                'leaf_number' => 'برگ صادرشده را نمی‌توان باطل کرد؛ ابتدا وضعیت چک را در صفحهٔ چک‌ها برگردانید.',
            ]);
        }

        $leaf->update(['status' => $status, 'note' => $note ?? $leaf->note]);

        return $leaf->fresh();
    }

    /**
     * The reconciliation statement for one book.
     *
     * @return array<string, mixed>
     */
    public function reconcile(int $tenantId, int $bookId): array
    {
        $book = AccChequeBook::query()->where('tenant_id', $tenantId)->with(['cashAccount', 'leaves'])->findOrFail($bookId);

        $leaves = $book->leaves;
        $byStatus = $leaves->groupBy('status');

        $unused = $byStatus->get(AccChequeLeaf::UNUSED, collect());
        $issued = $byStatus->get(AccChequeLeaf::ISSUED, collect());
        $cancelled = $byStatus->get(AccChequeLeaf::CANCELLED, collect());
        $lost = $byStatus->get(AccChequeLeaf::LOST, collect());

        // The only serial gap that matters: leaves that are neither unused nor accounted for.
        // Issued, cancelled and lost all consume a number; anything else is a hole.
        $accounted = $unused->count() + $issued->count() + $cancelled->count() + $lost->count();
        $total = $leaves->count();

        return [
            'book' => [
                'id' => $book->id,
                'title' => $book->title,
                'bank' => $book->bank,
                'cash_account' => $book->cashAccount?->name,
                'series_from' => $book->series_from,
                'series_to' => $book->series_to,
                'is_active' => (bool) $book->is_active,
            ],
            'totals' => [
                'leaves' => $total,
                'unused' => $unused->count(),
                'issued' => $issued->count(),
                'cancelled' => $cancelled->count(),
                'lost' => $lost->count(),
                'unaccounted' => max(0, $total - $accounted),
                'issued_value' => round((float) $issued->sum('amount'), 2),
                'next_leaf' => $unused->min('leaf_number'),
            ],
            'leaves' => $leaves->map(fn (AccChequeLeaf $leaf): array => [
                'leaf_number' => (int) $leaf->leaf_number,
                'status' => (string) $leaf->status,
                'amount' => $leaf->amount !== null ? (float) $leaf->amount : null,
                'due_date' => $leaf->due_date?->toDateString(),
                'issued_on' => $leaf->issued_on?->toDateString(),
                'person_id' => $leaf->person_id,
                'check_id' => $leaf->check_id,
                'note' => $leaf->note,
            ])->values()->all(),
        ];
    }

    private function toSerial(mixed $value): ?int
    {
        $raw = trim((string) ($value ?? ''));

        // Persian and Arabic digits are what a shop actually types.
        $raw = strtr($raw, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);

        return ctype_digit($raw) && $raw !== '' ? (int) $raw : null;
    }

    private function statusLabel(string $status): string
    {
        return match ($status) {
            AccChequeLeaf::ISSUED => 'صادرشده',
            AccChequeLeaf::CANCELLED => 'باطل‌شده',
            AccChequeLeaf::LOST => 'مفقود',
            default => $status,
        };
    }
}
