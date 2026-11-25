<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One tenant's answer to "which account plays this role".
 *
 * The ledger must not guess. A role that has never been mapped is a hard error at posting
 * time, not a silent fallback to 1101 — a fallback is how the sales journal ended up
 * posting cash into receivables in the first place.
 */
class AccAccountCoding extends Model
{
    use RecordsActivity;

    protected $table = 'accounting_account_coding';

    public const ROLE_SALES = 'sales';

    public const ROLE_SALES_RETURNS = 'sales_returns';

    public const ROLE_AR = 'ar';

    /**
     * Accounts payable. A payment voucher settles a payable; without a role for it the
     * counter side had to be guessed at code 211, which no tenant had mapped.
     */
    public const ROLE_AP = 'ap';

    public const ROLE_CASH = 'cash';

    public const ROLE_BANK = 'bank';

    public const ROLE_VAT = 'vat';

    public const ROLE_COGS = 'cogs';

    public const ROLE_INVENTORY = 'inventory';

    public const ROLE_DISCOUNT = 'discount';

    public const ROLE_SHIPPING = 'shipping';

    /** Payroll: the wage expense and the three things held back from a payslip. */
    public const ROLE_WAGE_EXPENSE = 'wage_expense';

    public const ROLE_SALARIES_PAYABLE = 'salaries_payable';

    public const ROLE_INSURANCE_PAYABLE = 'insurance_payable';

    public const ROLE_PAYROLL_TAX_PAYABLE = 'payroll_tax_payable';

    public const ROLE_TENDER = 'tender';

    protected $fillable = [
        'tenant_id',
        'role',
        'match_value',
        'code',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
