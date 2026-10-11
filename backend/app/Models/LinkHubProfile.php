<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LinkHubProfile extends Model
{
    public const KIND_BUSINESS = 'business';

    public const KIND_MEMBER = 'member';

    protected $table = 'link_hub_profiles';

    protected $fillable = [
        'tenant_id',
        'kind',
        'slug',
        'title',
        'avatar_url',
        'bio',
        'is_published',
        'theme_json',
        'sort',
    ];

    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'theme_json' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(LinkHubBlock::class, 'profile_id')->orderBy('sort');
    }
}
