<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccPriceList extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_price_lists';

    protected $fillable = ['tenant_id', 'name', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(AccPriceListItem::class, 'price_list_id');
    }
}
