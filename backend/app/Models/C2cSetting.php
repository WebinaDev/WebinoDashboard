<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class C2cSetting extends Model
{
    protected $fillable = ['tenant_id', 'payload'];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
