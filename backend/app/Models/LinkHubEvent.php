<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LinkHubEvent extends Model
{
    public const KIND_VIEW = 'view';

    public const KIND_CLICK = 'click';

    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'profile_id',
        'block_id',
        'kind',
        'visitor_hash',
        'target',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(LinkHubProfile::class, 'profile_id');
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(LinkHubBlock::class, 'block_id');
    }
}
