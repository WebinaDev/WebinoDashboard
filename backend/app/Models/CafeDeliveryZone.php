<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A delivery area with its own fee, minimum order and ETA. */
class CafeDeliveryZone extends Model
{
    use RecordsActivity;

    protected $table = 'cafe_delivery_zones';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name_fa',
        'name_en',
        'areas',
        'delivery_fee_minor',
        'minimum_order_minor',
        'eta_minutes',
        'radius_km',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'areas' => 'array',
            'delivery_fee_minor' => 'integer',
            'minimum_order_minor' => 'integer',
            'eta_minutes' => 'integer',
            'radius_km' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }
}
