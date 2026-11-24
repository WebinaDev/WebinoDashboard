<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Stock\StockOpening;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Opening stock from the sheet the shop already keeps.
 *
 * A café that has traded for a year opens with full shelves. Typing two hundred lines through
 * the receive form is where a migration stops — and typing them with a guessed price is where
 * the weighted average stays wrong for the following year.
 */
class StockOpeningTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'opening.test', 'slug' => 'op']);

        $this->actingAs(User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]), 'sanctum');

        foreach (['شیر', 'برنج', 'دانه قهوه'] as $name) {
            Product::query()->create([
                'tenant_id' => $this->tenant->id,
                'name' => $name,
                'slug' => 'p-'.md5($name),
                'price_minor' => 100_000,
                'currency' => 'IRT',
                'status' => 'publish',
                'type' => 'simple',
            ]);
        }

        DB::table('acc_warehouses')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'انبار اصلی',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function sheet(): string
    {
        // Persian digits, a Persian thousands separator, and a Jalali expiry: all three appear
        // in a real sheet, and all three used to be the reason an import failed.
        return implode("\n", [
            'نام کالا;مقدار;بهای واحد;انبار',
            'شیر;۱۲;۳۵٬۰۰۰;انبار اصلی',
            'برنج;۵۰;۱۲۰٬۰۰۰;انبار اصلی',
        ]);
    }

    public function test_the_preview_writes_nothing_and_reads_persian_numbers(): void
    {
        $preview = app(StockOpening::class)->preview((int) $this->tenant->id, $this->sheet());

        $this->assertSame(2, $preview['ready']);
        $this->assertSame([], $preview['errors']);

        $first = $preview['rows'][0];
        $this->assertSame('شیر', $first['product_name']);
        $this->assertEquals(12.0, $first['quantity']);
        $this->assertEquals(35000.0, $first['unit_cost_minor']);

        // Nothing was received: a preview that moves stock is not a preview.
        $this->assertSame(0, DB::table('stock_movements')->count());
    }

    public function test_commit_receives_each_row_and_posts_its_journal(): void
    {
        $result = app(StockOpening::class)->commit(
            (int) $this->tenant->id,
            $this->sheet(),
            [],
            null,
            now()->toDateString(),
        );

        $this->assertSame(2, $result['received']);
        $this->assertSame([], $result['failed']);
        $this->assertGreaterThan(0, $result['value_minor']);

        // Two goods receipts, so two journals — inventory up, payable up.
        $entries = DB::table('acc_journal_entries')->where('tenant_id', $this->tenant->id)->count();
        $this->assertSame(2, $entries);
    }

    /** A zero cost is refused, not assumed: it would zero every plate cost that uses the item. */
    public function test_a_row_without_a_cost_is_refused(): void
    {
        $sheet = "نام کالا,مقدار,بهای واحد\nشیر,10,\n";

        $preview = app(StockOpening::class)->preview((int) $this->tenant->id, $sheet);

        $this->assertSame(0, $preview['ready']);
        $this->assertSame(1, count($preview['errors']));
        $this->assertSame(2, $preview['errors'][0]['line']);
    }

    /** An unknown product is an error, not a new product: «شير» must not split «شیر»'s stock. */
    public function test_an_unknown_product_is_reported_not_created(): void
    {
        $sheet = "نام کالا,مقدار,بهای واحد\nشكر,10,5000\n";

        $preview = app(StockOpening::class)->preview((int) $this->tenant->id, $sheet);

        $this->assertSame(0, $preview['ready']);
        $this->assertStringContainsString('شكر', $preview['errors'][0]['message']);
        $this->assertSame(3, Product::query()->where('tenant_id', $this->tenant->id)->count());
    }

    /** One bad line must not abandon the other hundred and ninety-nine. */
    public function test_commit_lands_the_good_rows_and_reports_the_bad_one(): void
    {
        $sheet = implode("\n", [
            'نام کالا,مقدار,بهای واحد',
            'شیر,10,35000',
            'برنج,صفر,120000',
            'دانه قهوه, 2 ,900000',
        ]);

        $result = app(StockOpening::class)->commit((int) $this->tenant->id, $sheet, []);

        $this->assertSame(2, $result['received']);
        $this->assertSame(1, count($result['failed']));
        $this->assertSame(3, $result['failed'][0]['line']);
    }

    /** A Jalali expiry is converted, never stored as written (that would be fifty years past). */
    public function test_a_jalali_expiry_becomes_a_gregorian_date(): void
    {
        $sheet = "نام کالا,مقدار,بهای واحد,تاریخ انقضا\nشیر,5,35000,1403/09/10\n";

        $preview = app(StockOpening::class)->preview((int) $this->tenant->id, $sheet);

        $this->assertSame(1, $preview['ready']);
        $this->assertSame('2024-11-30', $preview['rows'][0]['expires_on']);
    }
}
