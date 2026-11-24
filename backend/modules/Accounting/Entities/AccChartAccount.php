<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccChartAccount extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_chart_accounts';

    protected $fillable = [
        'tenant_id',
        'code', 'name', 'parent_id', 'type', 'is_postable',
    ];

    protected function casts(): array
    {
        return [
            'is_postable' => 'boolean',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
