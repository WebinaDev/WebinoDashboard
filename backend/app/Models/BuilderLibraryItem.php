<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** "My templates": saved sections / pages / widgets reusable across builder documents. */
class BuilderLibraryItem extends Model
{
    protected $fillable = ['tenant_id', 'user_id', 'kind', 'title', 'category', 'document'];

    protected function casts(): array
    {
        return ['document' => 'array'];
    }
}
