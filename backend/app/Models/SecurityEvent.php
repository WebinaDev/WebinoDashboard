<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SecurityEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'type', 'severity', 'ip', 'country', 'method', 'path', 'user_agent', 'user_id', 'context', 'created_at'];

    protected function casts(): array
    {
        return ['context' => 'array', 'created_at' => 'datetime'];
    }
}
