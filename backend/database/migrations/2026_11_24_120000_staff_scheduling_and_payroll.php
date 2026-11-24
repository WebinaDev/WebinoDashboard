<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff scheduling, leave, attendance and payroll.
 *
 * A cafe's largest controllable cost is the rota, and none of it existed: no weekly schedule,
 * no leave, no overtime, no payslip. The consequence was concrete — the P&L had no payroll
 * line, so "prime cost" (the number every restaurant lives or dies by) could not be computed
 * from the system at all.
 *
 * Design notes that matter:
 *
 *  - **A shift is a plan; attendance is a fact.** `staff_shifts` is what was scheduled,
 *    `staff_attendance` is what actually happened (clock in/out). Payroll reads attendance and
 *    falls back to the plan only when nobody clocked in — an approved schedule is not evidence
 *    that someone worked.
 *  - **Pay is computed, then frozen.** A payroll run stores its lines with the rates used, so
 *    changing a contract next month cannot rewrite last month's payslips.
 *  - **Insurance and tax are data, not constants.** Rates differ by year and by shop; they live
 *    on the run so an auditor can see what was applied.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('staff_contracts')) {
            Schema::create('staff_contracts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // monthly | hourly | daily
                $table->string('pay_type', 12)->default('monthly');
                // Minor units. For monthly this is the gross salary; for hourly/daily the rate.
                $table->bigInteger('base_rate_minor')->default(0);
                // Contracted hours per week, used to derive an hourly rate for overtime.
                $table->decimal('weekly_hours', 6, 2)->default(44);
                // Statutory insurance share (7% employee / 23% employer in Iran; both stored).
                $table->decimal('employee_insurance_percent', 5, 2)->default(7);
                $table->decimal('employer_insurance_percent', 5, 2)->default(23);
                $table->decimal('overtime_multiplier', 4, 2)->default(1.4);
                $table->date('starts_on')->nullable();
                $table->date('ends_on')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['tenant_id', 'user_id', 'is_active'], 'staff_contracts_user_idx');
            });
        }

        if (! Schema::hasTable('staff_shifts')) {
            Schema::create('staff_shifts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->date('work_date');
                $table->time('starts_at');
                $table->time('ends_at');
                // The station or role they are covering (waiter, bar, kitchen…).
                $table->string('role', 40)->nullable();
                // planned | published | cancelled
                $table->string('status', 16)->default('planned');
                $table->string('note', 255)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'work_date'], 'staff_shifts_date_idx');
                $table->index(['tenant_id', 'user_id', 'work_date'], 'staff_shifts_user_date_idx');
            });
        }

        if (! Schema::hasTable('staff_attendance')) {
            Schema::create('staff_attendance', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('staff_shift_id')->nullable()->constrained('staff_shifts')->nullOnDelete();
                $table->date('work_date');
                $table->timestamp('clocked_in_at')->nullable();
                $table->timestamp('clocked_out_at')->nullable();
                // Stored on write: a shift that crosses midnight would otherwise compute wrong
                // every time it is read, and rounding rules change.
                $table->decimal('hours', 6, 2)->default(0);
                $table->decimal('overtime_hours', 6, 2)->default(0);
                $table->string('note', 255)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'work_date'], 'staff_attendance_date_idx');
                $table->index(['tenant_id', 'user_id', 'work_date'], 'staff_attendance_user_date_idx');
            });
        }

        if (! Schema::hasTable('staff_leave_requests')) {
            Schema::create('staff_leave_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // annual | sick | unpaid
                $table->string('type', 16)->default('annual');
                $table->date('starts_on');
                $table->date('ends_on');
                $table->string('reason', 500)->nullable();
                // pending | approved | rejected
                $table->string('status', 16)->default('pending');
                $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('decided_at')->nullable();
                $table->string('decision_note', 500)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'status'], 'staff_leave_status_idx');
            });
        }

        if (! Schema::hasTable('cafe_payroll_runs')) {
            Schema::create('cafe_payroll_runs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->date('period_start');
                $table->date('period_end');
                // draft | posted
                $table->string('status', 16)->default('draft');
                $table->bigInteger('gross_total_minor')->default(0);
                $table->bigInteger('employee_insurance_total_minor')->default(0);
                $table->bigInteger('employer_insurance_total_minor')->default(0);
                $table->bigInteger('tax_total_minor')->default(0);
                $table->bigInteger('net_total_minor')->default(0);
                // The journal this run posted, once approved.
                $table->unsignedBigInteger('journal_entry_id')->nullable();
                $table->json('settings')->nullable();
                $table->string('note', 500)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('posted_at')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'period_start', 'period_end'], 'cafe_payroll_runs_unique_period');
            });
        }

        if (! Schema::hasTable('cafe_payroll_lines')) {
            Schema::create('cafe_payroll_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('run_id')->constrained('cafe_payroll_runs')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('pay_type', 12)->default('monthly');
                $table->decimal('hours', 7, 2)->default(0);
                $table->decimal('overtime_hours', 7, 2)->default(0);
                $table->decimal('unpaid_leave_days', 6, 2)->default(0);
                $table->bigInteger('base_minor')->default(0);
                $table->bigInteger('overtime_minor')->default(0);
                $table->bigInteger('gross_minor')->default(0);
                $table->decimal('employee_insurance_percent', 5, 2)->default(0);
                $table->bigInteger('employee_insurance_minor')->default(0);
                $table->decimal('employer_insurance_percent', 5, 2)->default(0);
                $table->bigInteger('employer_insurance_minor')->default(0);
                $table->bigInteger('tax_minor')->default(0);
                $table->bigInteger('net_minor')->default(0);
                $table->json('breakdown')->nullable();
                $table->timestamps();

                $table->unique(['run_id', 'user_id'], 'cafe_payroll_lines_unique_user');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cafe_payroll_lines');
        Schema::dropIfExists('cafe_payroll_runs');
        Schema::dropIfExists('staff_leave_requests');
        Schema::dropIfExists('staff_attendance');
        Schema::dropIfExists('staff_shifts');
        Schema::dropIfExists('staff_contracts');
    }
};
