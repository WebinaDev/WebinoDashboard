<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccUnit extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_units';

    protected $fillable = ['tenant_id', 'name', 'symbol'];
}
