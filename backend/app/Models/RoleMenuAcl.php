<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoleMenuAcl extends Model
{
    protected $table = 'role_menu_acl';

    protected $fillable = [
        'role',
        'menu_key',
        'allowed',
    ];

    protected function casts(): array
    {
        return [
            'allowed' => 'boolean',
        ];
    }
}
