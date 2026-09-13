<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DashboardModule extends Model
{
    protected $table = 'dashboard_modules';

    protected $primaryKey = 'slug';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'slug',
        'distribution',
        'git_repo',
        'default_version',
        'requires_license',
    ];

    protected function casts(): array
    {
        return [
            'requires_license' => 'boolean',
        ];
    }

    public function isGitDistributed(): bool
    {
        return ($this->distribution ?? 'bundled') === 'git';
    }
}
