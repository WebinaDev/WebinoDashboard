<?php

namespace Modules\Cafe\Entities;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Routes an item (or a whole category) to the station that prepares it.
 *
 * A category row is the cheap way to route a menu — "everything in نوشیدنی goes to the
 * bar" — and a product row overrides it for the exceptions.
 */
class StationProduct extends Model
{
    use RecordsActivity;

    protected $table = 'cafe_station_products';

    protected $fillable = ['station_id', 'product_id', 'category_id'];

    public function station(): BelongsTo
    {
        return $this->belongsTo(KitchenStation::class, 'station_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
