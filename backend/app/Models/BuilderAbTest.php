<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BuilderAbTest extends Model
{
    protected $fillable = ['tenant_id', 'page_id', 'variant_page_id', 'split', 'status', 'views_a', 'views_b', 'conversions_a', 'conversions_b'];

    protected function casts(): array
    {
        return ['split' => 'integer', 'views_a' => 'integer', 'views_b' => 'integer', 'conversions_a' => 'integer', 'conversions_b' => 'integer'];
    }
}
