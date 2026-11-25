<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccCashAccount extends Model
{
    /**
     * What kind of money this is.
     *
     * `type` used to be a free string, so one shop wrote `bank` and another `بانک` and a third
     * left it blank — which made "how much is in terminals across all branches" unaskable. The
     * list is not an enum in the database (existing rows would break) but it is the vocabulary
     * the screens and reports agree on.
     *
     * The distinction that matters is *where the money is*: a card terminal holds money the
     * shop has earned but not yet received, so it is an asset with a settlement delay, not the
     * same thing as a bank balance. Reporting them as one hides that float.
     *
     * The keys are the ones the screens and existing rows already use (`cash`, `petty_cash`),
     * extended with the two the shop actually runs but could not name before: a card terminal
     * and a payment gateway. Renaming `cash` to `drawer` would have meant a data migration to
     * buy a synonym.
     */
    public const TYPE_CASH = 'cash';

    public const TYPE_PETTY = 'petty_cash';

    public const TYPE_BANK = 'bank';

    public const TYPE_TERMINAL = 'terminal';

    public const TYPE_GATEWAY = 'gateway';

    public const TYPES = [
        self::TYPE_CASH,
        self::TYPE_PETTY,
        self::TYPE_BANK,
        self::TYPE_TERMINAL,
        self::TYPE_GATEWAY,
    ];

    /** Labels for a picker, Persian first because that is who reads them. */
    public const TYPE_LABELS = [
        self::TYPE_CASH => 'صندوق',
        self::TYPE_PETTY => 'تنخواه',
        self::TYPE_BANK => 'حساب بانکی',
        self::TYPE_TERMINAL => 'کارتخوان',
        self::TYPE_GATEWAY => 'درگاه پرداخت',
    ];

    /** Types whose balance is money actually in hand, as opposed to money on its way. */
    public const SETTLED_TYPES = [self::TYPE_CASH, self::TYPE_PETTY, self::TYPE_BANK];

    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_cash_accounts';

    protected $fillable = [
        'tenant_id',        'name', 'type', 'bank_name', 'account_number', 'sheba', 'card_number', 'chart_code', 'is_active', 'is_default',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    public function receiptVouchers(): HasMany
    {
        return $this->hasMany(AccReceiptVoucher::class, 'cash_account_id');
    }
}
