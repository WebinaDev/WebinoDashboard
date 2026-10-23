<?php

namespace App\Models\Poetry;

use Illuminate\Database\Eloquent\Model;

class PoetryTerm extends Model
{
    public const KINDS = ['occasion', 'figure', 'style', 'meter'];

    protected $table = 'poetry_terms';

    protected $fillable = ['tenant_id', 'kind', 'slug', 'name', 'description', 'image', 'sort'];

    protected static function booted(): void
    {
        \App\Services\Poetry\PoetryScope::boot(static::class);
    }

    public function poems()
    {
        return $this->belongsToMany(PoetryPoem::class, 'poetry_poem_term', 'term_id', 'poem_id');
    }
}
