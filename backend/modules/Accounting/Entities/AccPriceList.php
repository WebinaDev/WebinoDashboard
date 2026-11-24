<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

/**
 * A buying or selling price list.
 *
 * Audited: a price list is the thing a rep quotes from, so "who changed this price and when"
 * has to have an answer that is not somebody's memory.
 */
class AccPriceList extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

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
