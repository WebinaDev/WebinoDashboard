<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LinkHubBlock extends Model
{
    public const TYPES = ['link', 'contact', 'form', 'faq', 'event', 'cta', 'section', 'image', 'gallery', 'map', 'hours'];

    protected $table = 'link_hub_blocks';

    protected $fillable = [
        'tenant_id',
        'profile_id',
        'type',
        'sort',
        'is_visible',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'is_visible' => 'boolean',
            'payload' => 'array',
        ];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(LinkHubProfile::class, 'profile_id');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(LinkHubFormSubmission::class, 'block_id');
    }
}
