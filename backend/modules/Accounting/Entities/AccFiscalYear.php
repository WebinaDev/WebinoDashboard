<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccFiscalYear extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_fiscal_years';

    protected $fillable = ['tenant_id', 'title', 'starts_on', 'ends_on', 'is_closed'];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'is_closed' => 'boolean',
        ];
    }
}
