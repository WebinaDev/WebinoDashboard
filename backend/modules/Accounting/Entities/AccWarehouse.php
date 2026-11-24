<?php

namespace Modules\Accounting\Entities;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccWarehouse extends Model
{
    use BelongsToTenant;
    use \App\Support\Audit\RecordsActivity;

    protected $table = 'acc_warehouses';

    protected $fillable = ['tenant_id', 'name', 'code', 'description', 'address', 'location', 'is_default', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function stockLines(): HasMany
    {
        return $this->hasMany(AccWarehouseStock::class, 'warehouse_id');
    }
}
