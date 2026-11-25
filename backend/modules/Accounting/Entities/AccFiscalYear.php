<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccFiscalYear extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_fiscal_years';

    protected $fillable = ['tenant_id', 'title', 'starts_on', 'ends_on', 'is_closed'];

    protected $appends = ['start_date', 'end_date', 'is_active'];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'is_closed' => 'boolean',
        ];
    }

    /**
     * Legacy/ERP field names, appended so both conventions serialize.
     *
     * The ported dashboard pages read `start_date`/`end_date`/`is_active` while the
     * table stores `starts_on`/`ends_on`/`is_closed` — without these accessors the
     * fiscal-year table rendered blank dates and badges.
     */
    protected function startDate(): Attribute
    {
        return Attribute::get(fn () => $this->starts_on);
    }

    protected function endDate(): Attribute
    {
        return Attribute::get(fn () => $this->ends_on);
    }

    protected function isActive(): Attribute
    {
        return Attribute::get(fn () => ! $this->is_closed);
    }
}
