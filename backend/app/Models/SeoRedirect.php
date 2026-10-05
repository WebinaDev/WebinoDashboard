<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeoRedirect extends Model
{
    protected $fillable = [
        'tenant_id',
        'from_path',
        'to_path',
        'status_code',
        'enabled',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
            'enabled' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
