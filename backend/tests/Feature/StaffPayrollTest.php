<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Staff\PayrollService;
use App\Services\Staff\ScheduleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Payroll arithmetic and the rota.
 *
 * Pay is the one place where a rounding decision reaches somebody's household, so these tests
 * pin the numbers rather than the shape: gross, both insurance shares, progressive tax, net,
 * and a journal that balances.
 */
class StaffPayrollTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\Tenant $tenant;

    private User $owner;

    private User $barista;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = $this->createTenant(['domain' => 'payroll.test', 'slug' => 'payroll']);
        $this->enableSubmodules($this->tenant->id, ['cafe.menu' => true]);

        $this->owner = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'admin']);
        $this->barista = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);

        // Ledger rows are stamped with the authenticated tenant, exactly as a request would.
        $this->actingAs($this->owner, 'sanctum');
    }

    private function contract(array $overrides = []): void
    {
        DB::table('staff_contracts')->insert(array_merge([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->barista->id,
            'pay_type' => 'monthly',
            'base_rate_minor' => 30_000_000,
            'weekly_hours' => 44,
            'employee_insurance_percent' => 7,
            'employer_insurance_percent' => 23,
            'overtime_multiplier' => 1.4,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function clockHours(float $hours, float $overtime = 0): void
    {
        DB::table('staff_attendance')->insert([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->barista->id,
            'work_date' => now()->toDateString(),
            'clocked_in_at' => now()->subHours((int) max(1, round($hours))),
            'clocked_out_at' => now(),
            'hours' => $hours,
            'overtime_hours' => $overtime,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Monthly 30,000,000 with 7% / 23% insurance and no overtime:
     *   employee insurance 2,100,000; taxable 27,900,000
     *   tax: first 25,000,000 free, remaining 2,900,000 at 10% = 290,000
     *   net = 30,000,000 − 2,100,000 − 290,000 = 27,610,000
     */
    public function test_a_monthly_payslip_computes_insurance_tax_and_net(): void
    {
        $this->contract();
        $this->clockHours(176);

        $run = app(PayrollService::class)->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $line = $run['lines'][0];

        $this->assertSame(30_000_000, $line['gross_minor']);
        $this->assertSame(2_100_000, $line['employee_insurance_minor']);
        $this->assertSame(6_900_000, $line['employer_insurance_minor']);
        $this->assertSame(290_000, $line['tax_minor']);
        $this->assertSame(27_610_000, $line['net_minor']);
        $this->assertSame(30_000_000, $run['gross_total_minor']);
    }

    /** No tax at all on a salary below the exemption. */
    public function test_a_low_salary_pays_no_tax(): void
    {
        $this->contract(['base_rate_minor' => 20_000_000]);
        $this->clockHours(176);

        $run = app(PayrollService::class)->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $line = $run['lines'][0];
        $this->assertSame(0, $line['tax_minor']);
        $this->assertSame(20_000_000 - 1_400_000, $line['net_minor']);
    }

    /** Brackets are applied per band, not to the whole amount at the top rate. */
    public function test_tax_is_progressive_not_flat(): void
    {
        $service = app(PayrollService::class);

        // 60,000,000 taxable: 25M free + 25M at 10% (2.5M) + 10M at 15% (1.5M) = 4,000,000.
        $this->assertSame(4_000_000, $service->progressiveTax(60_000_000));

        // The whole amount at the top band would be 12,000,000 — three times the real figure.
        $this->assertLessThan(6_000_000, $service->progressiveTax(60_000_000));

        $this->assertSame(0, $service->progressiveTax(10_000_000));
    }

    /** Overtime is paid at the contract multiplier on the derived hourly rate. */
    public function test_overtime_is_paid_at_the_contract_multiplier(): void
    {
        $this->contract();
        // 44 h/week over a month ≈ 190.67 h; hourly ≈ 30,000,000 / 190.67 ≈ 157,342.
        $this->clockHours(176, 10);

        $run = app(PayrollService::class)->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $line = $run['lines'][0];
        $hourly = 30_000_000 / ((44 * 52) / 12);
        $expectedOvertime = (int) round($hourly * 10 * 1.4);

        $this->assertSame($expectedOvertime, $line['overtime_minor']);
        $this->assertSame(30_000_000 + $expectedOvertime, $line['gross_minor']);
    }

    /** An hourly contract pays by the hours actually clocked. */
    public function test_an_hourly_contract_pays_for_hours_worked_not_for_the_month(): void
    {
        $this->contract(['pay_type' => 'hourly', 'base_rate_minor' => 200_000]);
        $this->clockHours(80);

        $run = app(PayrollService::class)->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $this->assertSame(16_000_000, $run['lines'][0]['gross_minor'], '80 hours × 200,000');
    }

    /** Approving a run posts one balanced journal and freezes the run. */
    public function test_posting_a_run_writes_a_balanced_journal(): void
    {
        $this->contract();
        $this->clockHours(176);

        $service = app(PayrollService::class);
        $run = $service->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $posted = $service->postRun($this->owner, $run['id']);

        $this->assertSame('posted', $posted['status']);
        $this->assertNotNull($posted['journal_entry_id']);

        $lines = DB::table('acc_journal_lines')->where('journal_entry_id', $posted['journal_entry_id'])->get();

        $this->assertSame(
            (float) $lines->sum('debit'),
            (float) $lines->sum('credit'),
            'a payroll journal must balance',
        );

        // Expense = gross + employer insurance = 30,000,000 + 6,900,000.
        $this->assertSame(36_900_000.0, (float) $lines->sum('debit'));
    }

    /** A posted run cannot be rebuilt: somebody has already been paid against it. */
    public function test_a_posted_run_cannot_be_rebuilt(): void
    {
        $this->contract();
        $this->clockHours(176);

        $service = app(PayrollService::class);
        $run = $service->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);
        $service->postRun($this->owner, $run['id']);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->buildRun($this->owner, [
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);
    }

    /** A shift that crosses midnight counts the hours after midnight. */
    public function test_a_shift_crossing_midnight_counts_the_whole_span(): void
    {
        $hours = app(ScheduleService::class)->hoursBetween('22:00', '02:00');

        $this->assertSame(4.0, $hours);
    }

    /** Clock-out stores the hours, so every reader sees the same number. */
    public function test_clocking_out_stores_hours_and_overtime_against_the_plan(): void
    {
        $schedule = app(ScheduleService::class);

        $shiftId = DB::table('staff_shifts')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->barista->id,
            'work_date' => now()->toDateString(),
            'starts_at' => now()->subHours(9)->format('H:i'),
            'ends_at' => now()->subHours(1)->format('H:i'),
            'status' => 'published',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $schedule->clock($this->barista, 'in', $shiftId);
        // Backdate the clock-in so the computed shift is a known length.
        DB::table('staff_attendance')
            ->where('user_id', $this->barista->id)
            ->update(['clocked_in_at' => now()->subHours(10)]);

        $result = $schedule->clock($this->barista, 'out');

        $this->assertSame(10.0, $result['hours']);
        $this->assertSame(2.0, $result['overtime_hours'], 'two hours past an eight-hour plan');

        $stored = DB::table('staff_attendance')->where('user_id', $this->barista->id)->first();
        $this->assertSame(10.0, (float) $stored->hours, 'the hours are frozen on write');
    }

    /** Clocking in twice is refused rather than silently creating a second row. */
    public function test_clocking_in_twice_is_refused(): void
    {
        $schedule = app(ScheduleService::class);
        $schedule->clock($this->barista, 'in');

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $schedule->clock($this->barista, 'in');
    }

    /** A staff member without manager rights sees only their own shifts. */
    public function test_a_staff_member_sees_only_their_own_rota(): void
    {
        $other = User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'staff']);

        foreach ([$this->barista, $other] as $person) {
            DB::table('staff_shifts')->insert([
                'tenant_id' => $this->tenant->id,
                'user_id' => $person->id,
                'work_date' => now()->toDateString(),
                'starts_at' => '09:00',
                'ends_at' => '17:00',
                'status' => 'published',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $week = $this->actingAs($this->barista, 'sanctum')
            ->getJson('/api/v1/staff/week')
            ->assertOk()
            ->json('data');

        $all = collect($week['days'])->flatMap(fn ($day) => $day['shifts']);
        $this->assertCount(1, $all);
        $this->assertSame($this->barista->id, $all->first()['user_id']);
    }
}
