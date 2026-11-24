<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccPersonCategory extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_person_categories';

    protected $fillable = ['tenant_id', 'name', 'sort_order'];
}
