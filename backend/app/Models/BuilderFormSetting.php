<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Server-side "Actions after submit" for a builder form (never trusted from the public payload). */
class BuilderFormSetting extends Model
{
    protected $fillable = ['tenant_id', 'form_key', 'actions'];

    protected function casts(): array
    {
        return ['actions' => 'array'];
    }
}
