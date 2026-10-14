<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BuilderCollectionItem extends Model
{
    protected $fillable = ['tenant_id', 'collection_id', 'slug', 'title', 'data', 'published', 'sort', 'seo'];

    protected function casts(): array
    {
        return ['data' => 'array', 'seo' => 'array', 'published' => 'boolean', 'sort' => 'integer'];
    }
}
