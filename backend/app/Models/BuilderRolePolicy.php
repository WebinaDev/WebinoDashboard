<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BuilderRolePolicy extends Model
{
    protected $fillable = ['tenant_id', 'role', 'can_edit', 'can_publish', 'can_design'];

    protected function casts(): array
    {
        return ['can_edit' => 'boolean', 'can_publish' => 'boolean', 'can_design' => 'boolean'];
    }
}
