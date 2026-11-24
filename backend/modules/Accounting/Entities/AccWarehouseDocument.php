<?php

namespace Modules\Accounting\Entities;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Accounting\Entities\Concerns\BelongsToTenant;

class AccWarehouseDocument extends Model
{
    use BelongsToTenant;

    protected $table = 'acc_warehouse_documents';

    protected $fillable = [
        'tenant_id',        'type', 'warehouse_id', 'number', 'document_date', 'status', 'reference', 'items', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'document_date' => 'date',
            'items' => 'array',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(AccWarehouse::class, 'warehouse_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
