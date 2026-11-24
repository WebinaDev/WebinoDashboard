<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Cafe\Services\MenuImport;
use Tests\TestCase;

/**
 * Importing a price list.
 *
 * The two things that must never happen: a dish imported at zero because its price cell was
 * blank, and a corrected sheet re-imported as a second copy of every dish.
 */
class CafeMenuImportTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private \App\Models\User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'import.test', 'slug' => 'import']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true]);

        $this->owner = \App\Models\User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
        ]);

        $this->actingAs($this->owner, 'sanctum');
    }

    /** Persian digits and thousands separators are the normal case, not an edge case. */
    public function test_persian_digits_and_separators_parse_into_money(): void
    {
        $import = app(MenuImport::class);

        $this->assertSame(45000, $import->money('45,000'));
        $this->assertSame(45000, $import->money('۴۵٬۰۰۰'));
        $this->assertSame(45000, $import->money('45000 تومان'));
        $this->assertNull($import->money('abc'));
    }

    /** A quoted comma inside a Persian name does not split the row. */
    public function test_a_quoted_cell_with_a_comma_does_not_split_the_row(): void
    {
        $csv = "name,price\n\"کیک شکلات، ویژه\",45000\n";

        $rows = app(MenuImport::class)->parse($csv);

        $this->assertCount(1, $rows);
        $this->assertSame('کیک شکلات، ویژه', $rows[0]['name']);
    }

    /** Excel's BOM must not become part of the first heading. */
    public function test_a_utf8_bom_does_not_break_the_first_heading(): void
    {
        $csv = "\xEF\xBB\xBFname,price\nLatte,45000\n";

        $rows = app(MenuImport::class)->parse($csv);

        $this->assertSame(['name' => 'Latte', 'price' => '45000'], $rows[0]);
    }

    /** A semicolon-delimited export is recognised without asking. */
    public function test_a_semicolon_export_is_parsed(): void
    {
        $csv = "name;price\nLatte;45000\n";

        $rows = app(MenuImport::class)->parse($csv);

        $this->assertSame('45000', $rows[0]['price']);
    }

    /** Preview writes nothing, and reports the rows it would refuse. */
    public function test_preview_reports_bad_rows_without_writing(): void
    {
        $csv = "name,price\nLatte,45000\nMystery,\n";

        $result = app(MenuImport::class)->preview($csv, [], $this->tenant->id);

        $this->assertSame(2, $result['total']);
        $this->assertSame(1, $result['valid']);
        $this->assertSame(1, $result['invalid']);
        $this->assertSame(3, $result['errors'][0]['line'], 'the row number must match the sheet');

        $this->assertSame(0, Product::query()->count(), 'preview must not write');
    }

    /** A blank price is an error, never a zero-priced dish. */
    public function test_a_blank_price_is_never_turned_into_zero(): void
    {
        $csv = "name,price\nLatte,\n";

        $result = app(MenuImport::class)->commit($csv, [], $this->tenant->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, count($result['failed']));
        $this->assertNull(Product::query()->where('name', 'Latte')->first());
    }

    /** A good sheet imports, and each row gets a URL-safe slug. */
    public function test_a_valid_sheet_creates_products(): void
    {
        $csv = "name,price,category\nLatte,45000,Drinks\nEspresso,30000,Drinks\n";

        $result = app(MenuImport::class)->commit($csv, [], $this->tenant->id);

        $this->assertSame(2, $result['created']);
        $this->assertSame(45000, (int) Product::query()->where('name', 'Latte')->value('price_minor'));
        $this->assertNotEmpty(Product::query()->where('name', 'Espresso')->value('slug'));
    }

    /** Re-importing a corrected sheet fixes the price instead of creating a duplicate. */
    public function test_re_importing_updates_instead_of_duplicating(): void
    {
        $import = app(MenuImport::class);

        $import->commit("name,price\nLatte,45000\n", [], $this->tenant->id);
        $result = $import->commit("name,price\nLatte,52000\n", [], $this->tenant->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['updated']);
        $this->assertSame(1, Product::query()->where('name', 'Latte')->count());
        $this->assertSame(52000, (int) Product::query()->where('name', 'Latte')->value('price_minor'));
    }

    /** SKU wins over the name, so a renamed dish is still the same dish. */
    public function test_a_sku_match_survives_a_rename(): void
    {
        $import = app(MenuImport::class);

        $import->commit("name,sku,price\nLatte,L-1,45000\n", [], $this->tenant->id);
        $result = $import->commit("name,sku,price\nLatte Grande,L-1,55000\n", [], $this->tenant->id);

        $this->assertSame(0, $result['created']);
        $this->assertSame(1, $result['updated']);
    }

    /** One bad row does not abandon the rest of the batch. */
    public function test_a_bad_row_does_not_stop_the_others(): void
    {
        $csv = "name,price\nLatte,45000\n,30000\nMocha,52000\n";

        $result = app(MenuImport::class)->commit($csv, [], $this->tenant->id);

        $this->assertSame(2, $result['created']);
        $this->assertSame(1, count($result['failed']));
        $this->assertSame(2, Product::query()->count());
    }

    /** Two rows with the same name do not fight over one slug. */
    public function test_two_products_with_the_same_name_get_distinct_slugs(): void
    {
        $import = app(MenuImport::class);

        $import->commit("name,price\nLatte,45000\nLatte,48000\n", [], $this->tenant->id);

        $slugs = Product::query()->pluck('slug')->all();

        $this->assertCount(2, $slugs);
        $this->assertSame(2, count(array_unique($slugs)));
    }

    /** The endpoint previews and then commits, over HTTP. */
    public function test_the_endpoints_preview_then_commit(): void
    {
        $csv = "name,price\nLatte,45000\n";

        $preview = $this->postJson('/api/v1/cafe/menu-import/preview', ['content' => $csv])
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $preview['valid']);
        $this->assertSame(0, Product::query()->count());

        $this->postJson('/api/v1/cafe/menu-import/commit', ['content' => $csv])
            ->assertOk()
            ->assertJsonPath('data.created', 1);

        $this->assertSame(1, Product::query()->count());
    }
}
