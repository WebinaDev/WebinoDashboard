<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BuilderCollection extends Model
{
    protected $fillable = ['tenant_id', 'slug', 'name', 'fields', 'seo'];

    protected function casts(): array
    {
        return ['fields' => 'array', 'seo' => 'array'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(BuilderCollectionItem::class, 'collection_id');
    }
}
