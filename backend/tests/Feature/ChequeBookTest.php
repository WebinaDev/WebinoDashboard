<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Accounting\ChequeBook;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Modules\Accounting\Entities\AccChequeBook;
use Modules\Accounting\Entities\AccChequeLeaf;
use Tests\TestCase;

/**
 * A cheque book is a serial range you can lose control of, so that is what these tests check.
 *
 * The number that matters at the bank is not "how many cheques did we write" but "which serials
 * are missing", and the two only agree if a leaf is consumed exactly once and a spoiled leaf
 * keeps its number.
 */
class ChequeBookTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'chequebook.test', 'slug' => 'cbk']);
        $this->actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']));
    }

    private function open(int $from = 100001, int $to = 100010): AccChequeBook
    {
        return app(ChequeBook::class)->open($this->tenant->id, [
            'title' => 'دسته چک بانک ملت',
            'bank' => 'ملت',
            'series_from' => $from,
            'series_to' => $to,
        ]);
    }

    public function test_opening_a_book_creates_one_leaf_per_printed_serial(): void
    {
        $book = $this->open(100001, 100010);

        $this->assertSame(10, $book->leaves()->count());
        $this->assertSame(100001, (int) $book->leaves()->min('leaf_number'));
        $this->assertSame(100010, (int) $book->leaves()->max('leaf_number'));
        $this->assertSame(10, $book->leaves()->where('status', AccChequeLeaf::UNUSED)->count());
    }

    /** Persian digits are what a shop types; refusing them would be a bug, not a validation. */
    public function test_persian_digits_are_accepted_as_serials(): void
    {
        $book = app(ChequeBook::class)->open($this->tenant->id, [
            'title' => 'دسته چک',
            'series_from' => '۱۰۰۲۰۱',
            'series_to' => '۱۰۰۲۰۵',
        ]);

        $this->assertSame('100201', (string) $book->series_from);
        $this->assertSame(5, $book->leaves()->count());
    }

    public function test_a_reversed_range_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->open(100010, 100001);
    }

    /** A hundred thousand leaves is a typo, and filling the table with it is not recoverable. */
    public function test_an_absurd_range_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->open(100001, 200001);
    }

    public function test_leaves_the_bank_voided_start_out_cancelled(): void
    {
        $book = app(ChequeBook::class)->open($this->tenant->id, [
            'title' => 'دسته چک',
            'series_from' => 100001,
            'series_to' => 100006,
            'void_from' => 100005,
            'void_to' => 100006,
        ]);

        $this->assertSame(4, $book->leaves()->where('status', AccChequeLeaf::UNUSED)->count());
        $this->assertSame(2, $book->leaves()->where('status', AccChequeLeaf::CANCELLED)->count());
    }

    public function test_issuing_a_cheque_consumes_the_leaf_and_records_the_amount(): void
    {
        $book = $this->open();

        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, [
            'leaf_number' => 100003,
            'amount' => 4_500_000,
        ]);

        $leaf = AccChequeLeaf::query()->where('cheque_book_id', $book->id)->where('leaf_number', 100003)->firstOrFail();

        $this->assertSame(AccChequeLeaf::ISSUED, $leaf->status);
        $this->assertNotNull($leaf->check_id, 'a written cheque must have a check row behind it');
        $this->assertSame(4_500_000.0, (float) $leaf->amount);
    }

    /** The serial is the only identity a cheque has when it comes back months later. */
    public function test_a_leaf_cannot_be_used_twice(): void
    {
        $book = $this->open();

        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100002, 'amount' => 100_000]);

        $this->expectException(ValidationException::class);

        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100002, 'amount' => 200_000]);
    }

    public function test_a_number_outside_the_printed_range_is_refused(): void
    {
        $book = $this->open();

        $this->expectException(ValidationException::class);

        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100099, 'amount' => 100_000]);
    }

    public function test_a_cancelled_leaf_stays_consumed(): void
    {
        $book = $this->open();

        app(ChequeBook::class)->spoil($this->tenant->id, (int) $book->id, 100004, AccChequeLeaf::CANCELLED, 'چک خراب شد');

        $leaf = AccChequeLeaf::query()->where('cheque_book_id', $book->id)->where('leaf_number', 100004)->firstOrFail();
        $this->assertSame(AccChequeLeaf::CANCELLED, $leaf->status);

        // The paper still exists with that number on it, so the number is not free again.
        $this->expectException(ValidationException::class);
        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100004, 'amount' => 100_000]);
    }

    public function test_a_lost_leaf_is_reportable(): void
    {
        $book = $this->open();

        app(ChequeBook::class)->spoil($this->tenant->id, (int) $book->id, 100007, AccChequeLeaf::LOST);

        $report = app(ChequeBook::class)->reconcile($this->tenant->id, (int) $book->id);

        $this->assertSame(1, $report['totals']['lost']);
        $this->assertSame(9, $report['totals']['unused']);
        $this->assertSame(0, $report['totals']['unaccounted'], 'every leaf is accounted for');
        $this->assertSame(100001, $report['totals']['next_leaf']);
    }

    public function test_reconcile_counts_issued_value_and_next_leaf(): void
    {
        $book = $this->open();

        $service = app(ChequeBook::class);
        $service->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100001, 'amount' => 300_000]);
        $service->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100002, 'amount' => 200_000]);

        $report = $service->reconcile($this->tenant->id, (int) $book->id);

        $this->assertSame(2, $report['totals']['issued']);
        $this->assertSame(500_000.0, $report['totals']['issued_value']);
        $this->assertSame(100003, $report['totals']['next_leaf']);
        $this->assertCount(10, $report['leaves']);
    }

    public function test_a_closed_book_issues_nothing(): void
    {
        $book = $this->open();
        DB::table('acc_cheque_books')->where('id', $book->id)->update(['is_active' => false]);

        $this->expectException(ValidationException::class);

        app(ChequeBook::class)->issue($this->tenant->id, (int) $book->id, ['leaf_number' => 100001, 'amount' => 100_000]);
    }
}
