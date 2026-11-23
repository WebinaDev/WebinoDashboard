<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    use RecordsActivity;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'guest_name',
        'guest_phone',
        'party_size',
        'reserved_at',
        'status',
        'notes',
        // Seating life, added by the operations foundation migration. Without them here the
        // controller's timestamps were silently discarded by mass assignment.
        'table_id',
        'source',
        'confirmed_at',
        'declined_at',
        'decline_reason',
        'seated_at',
        'no_show_at',
    ];

    protected function casts(): array
    {
        return [
            'party_size' => 'integer',
            'reserved_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'declined_at' => 'datetime',
            'seated_at' => 'datetime',
            'no_show_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
    }

    /** The table the party was given, when the host assigned one. */
    public function table(): BelongsTo
    {
        return $this->belongsTo(CafeTable::class, 'table_id');
    }
}
