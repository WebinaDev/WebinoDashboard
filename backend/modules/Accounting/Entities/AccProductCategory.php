<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccProductCategory extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_product_categories';

    protected $fillable = ['tenant_id', 'name', 'sort_order'];
}
