<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccPriceListItem extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_price_list_items';

    protected $fillable = ['tenant_id', 'price_list_id', 'product_id', 'price'];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
        ];
    }

    public function priceList(): BelongsTo
    {
        return $this->belongsTo(AccPriceList::class, 'price_list_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(AccProduct::class, 'product_id');
    }
}
