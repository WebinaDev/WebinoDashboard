<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportAutomationRule extends Model
{
    protected $fillable = [
        'tenant_id', 'name_fa', 'name_en', 'trigger', 'conditions', 'actions',
        'is_active', 'priority', 'run_count', 'last_run_at',
    ];

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'actions' => 'array',
            'is_active' => 'boolean',
            'last_run_at' => 'datetime',
        ];
    }

    public function runs(): HasMany
    {
        return $this->hasMany(SupportAutomationRun::class, 'rule_id');
    }
}
