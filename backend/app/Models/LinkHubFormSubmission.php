<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LinkHubFormSubmission extends Model
{
    protected $table = 'link_hub_form_submissions';

    protected $fillable = [
        'tenant_id',
        'profile_id',
        'block_id',
        'payload',
        'ip_hash',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
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
