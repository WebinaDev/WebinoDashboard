<?php

namespace Tests\Feature;

use App\Kernel\SiteTypeProfiles;
use App\Kernel\TenantActivationService;
use App\Models\TenantSubmoduleActivation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The full ERP ledger must work on every site type, not just shop-like ones.
 *
 * The gaps this locks down:
 *  1. Every site-type profile lists the `accounting` module with all submodules.
 *  2. Provisioning a non-commerce tenant (blog) enables accounting and seeds a
 *     chart + fiscal year, so the first invoice can post.
 *  3. The ERP API answers for that tenant instead of 403 MODULE_NOT_ACTIVE —
 *     the routes are gated by `module:erp-accounting`, which resolves to the
 *     accounting module, not the commerce till ledger.
 *  4. The REST surface covers fiscal years, journals, persons, products, cash
 *     accounts, checks, receipts, invoices and warehouses end to end.
 */
class ErpAccountingAllSiteTypesTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_site_type_profile_includes_the_full_ledger(): void
    {
        foreach (SiteTypeProfiles::TYPES as $siteType) {
            $modules = SiteTypeProfiles::modulesFor($siteType);

            $this->assertArrayHasKey('accounting', $modules, "site type [{$siteType}] has no accounting module");
            $this->assertSame(
                ['dashboard', 'persons', 'products', 'invoices', 'journals', 'ledger', 'reports', 'cash', 'checks', 'receipts', 'warehouses', 'settings'],
                $modules['accounting'],
                "site type [{$siteType}] does not ship the full ledger",
            );
        }
    }

    public function test_blog_tenant_gets_a_working_ledger_on_provision(): void
    {
        $tenant = $this->createTenant(['site_type_slug' => null, 'business_type_slug' => null]);

        app(TenantActivationService::class)->applySiteType($tenant, 'blog');

        $this->assertTrue(
            TenantSubmoduleActivation::query()
                ->where('tenant_id', $tenant->id)
                ->where('module_slug', 'accounting')
                ->where('submodule_slug', 'dashboard')
                ->where('enabled', true)
                ->exists(),
            'blog tenant has no accounting.dashboard activation',
        );

        // First-run provisioning: chart + fiscal year exist without a manual seed.
        $this->assertTrue(
            DB::table('acc_chart_accounts')->where('tenant_id', $tenant->id)->where('code', '113')->exists(),
            'default chart was not seeded',
        );
        $this->assertTrue(
            DB::table('acc_fiscal_years')->where('tenant_id', $tenant->id)->exists(),
            'no fiscal year was created',
        );
    }

    public function test_erp_api_answers_for_a_blog_tenant(): void
    {
        $tenant = $this->createTenant(['site_type_slug' => 'blog', 'business_type_slug' => 'blog']);
        $this->enableSubmodules($tenant->id, [
            'accounting.dashboard' => true,
            'accounting.persons' => true,
            'accounting.products' => true,
            'accounting.invoices' => true,
            'accounting.journals' => true,
            'accounting.ledger' => true,
            'accounting.reports' => true,
            'accounting.cash' => true,
            'accounting.checks' => true,
            'accounting.receipts' => true,
            'accounting.warehouses' => true,
            'accounting.settings' => true,
        ]);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/erp-accounting/summary')
            ->assertOk()
            ->assertJsonPath('data.fiscal_years_count', 0);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/erp-accounting/chart')
            ->assertOk();
    }

    public function test_rest_crud_round_trip(): void
    {
        $tenant = $this->createTenant(['site_type_slug' => 'corporate', 'business_type_slug' => 'corporate']);
        $this->enableSubmodules($tenant->id, [
            'accounting.dashboard' => true,
            'accounting.persons' => true,
            'accounting.products' => true,
            'accounting.invoices' => true,
            'accounting.journals' => true,
            'accounting.ledger' => true,
            'accounting.reports' => true,
            'accounting.cash' => true,
            'accounting.checks' => true,
            'accounting.receipts' => true,
            'accounting.warehouses' => true,
            'accounting.settings' => true,
        ]);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->actingAs($user, 'sanctum');

        $fy = $this->postJson('/api/v1/erp-accounting/fiscal-years', [
            'title' => '1404',
            'starts_on' => '2025-03-21',
            'ends_on' => '2026-03-20',
        ])->assertCreated()->json('data');
        $this->assertNotEmpty($fy['id']);

        $person = $this->postJson('/api/v1/erp-accounting/persons', [
            'name' => 'مشتری تست',
            'mobile' => '09120000000',
        ])->assertCreated()->json('data');

        $product = $this->postJson('/api/v1/erp-accounting/products', [
            'name' => 'کالای تست',
            'sell_price' => 1000,
        ])->assertCreated()->json('data');

        $cash = $this->postJson('/api/v1/erp-accounting/cash-accounts', [
            'name' => 'صندوق تست',
            'type' => 'cash',
        ])->assertCreated()->json('data');

        $check = $this->postJson('/api/v1/erp-accounting/checks', [
            'number' => 'CHK-1',
            'amount' => 5000,
            'cash_account_id' => $cash['id'],
            'person_id' => $person['id'],
        ])->assertCreated()->json('data');

        $receipt = $this->postJson('/api/v1/erp-accounting/receipts', [
            'number' => 'RC-1',
            'amount' => 5000,
            'fiscal_year_id' => $fy['id'],
            'cash_account_id' => $cash['id'],
            'person_id' => $person['id'],
        ])->assertCreated()->json('data');

        $invoice = $this->postJson('/api/v1/erp-accounting/invoices', [
            'number' => 'INV-1',
            'total' => 5000,
            'fiscal_year_id' => $fy['id'],
            'person_id' => $person['id'],
        ])->assertCreated()->json('data');

        $warehouse = $this->postJson('/api/v1/erp-accounting/warehouses', [
            'name' => 'انبار تست',
        ])->assertCreated()->json('data');

        // Seed the chart, then post a balanced journal through REST.
        $this->postJson('/api/v1/erp-accounting/chart/seed')->assertOk();

        $chart = $this->getJson('/api/v1/erp-accounting/chart')->assertOk()->json('data');
        $cashAccount = collect($chart)->firstWhere('code', '111');
        $revenueAccount = collect($chart)->firstWhere('code', '401');
        $this->assertNotNull($cashAccount, 'chart seed did not create 111');
        $this->assertNotNull($revenueAccount, 'chart seed did not create 401');

        $journal = $this->postJson('/api/v1/erp-accounting/journals', [
            'fiscal_year_id' => $fy['id'],
            'document_date' => '2025-04-01',
            'lines' => [
                ['account_id' => $cashAccount['id'], 'debit' => 5000, 'credit' => 0],
                ['account_id' => $revenueAccount['id'], 'debit' => 0, 'credit' => 5000],
            ],
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/erp-accounting/journals/{$journal['id']}/post")->assertOk();

        // Unbalanced journals are refused.
        $this->postJson('/api/v1/erp-accounting/journals', [
            'fiscal_year_id' => $fy['id'],
            'document_date' => '2025-04-02',
            'lines' => [
                ['account_id' => $cashAccount['id'], 'debit' => 5000, 'credit' => 0],
                ['account_id' => $revenueAccount['id'], 'debit' => 0, 'credit' => 4000],
            ],
        ])->assertUnprocessable();

        // Confirming the invoice posts its journal (chart already seeded).
        $this->postJson("/api/v1/erp-accounting/invoices/{$invoice['id']}/confirm")->assertOk();

        // Lists are paginated with meta the dashboard reads. Two journals: the
        // manual one above plus the one the invoice confirm posted.
        $this->getJson('/api/v1/erp-accounting/persons')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/erp-accounting/journals')->assertOk()->assertJsonPath('meta.total', 2);

        // Deletes work.
        $this->deleteJson("/api/v1/erp-accounting/checks/{$check['id']}")->assertNoContent();
        $this->deleteJson("/api/v1/erp-accounting/receipts/{$receipt['id']}")->assertNoContent();
        $this->deleteJson("/api/v1/erp-accounting/warehouses/{$warehouse['id']}")->assertNoContent();
        $this->deleteJson("/api/v1/erp-accounting/products/{$product['id']}")->assertNoContent();
    }
}
