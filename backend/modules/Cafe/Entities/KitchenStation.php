<?php

namespace Modules\Cafe\Entities;

use App\Models\Product;
use App\Models\User;
use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A physical prep point — bar, grill, dessert pass.
 *
 * The KDS board is filtered by station so a cook sees only what their station is
 * responsible for. A station may be tenant-wide (`branch_id` null) or pinned to one branch.
 */
class KitchenStation extends Model
{
    use RecordsActivity;

    protected $table = 'cafe_kitchen_stations';

    public const KIND_KITCHEN = 'kitchen';

    public const KIND_BAR = 'bar';

    public const KIND_DESSERT = 'dessert';

    public const KIND_PASS = 'pass';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name_fa',
        'name_en',
        'slug',
        'kind',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'cafe_station_products', 'station_id', 'product_id')
            ->withTimestamps();
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'cafe_station_users', 'station_id', 'user_id')
            ->withTimestamps();
    }

    public function stationProducts(): HasMany
    {
        return $this->hasMany(StationProduct::class, 'station_id');
    }
}
