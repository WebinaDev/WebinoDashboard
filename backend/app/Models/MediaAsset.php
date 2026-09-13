<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class MediaAsset extends Model
{
    protected $fillable = [
        'tenant_id', 'folder', 'path', 'disk', 'mime', 'size', 'alt', 'original_name',
    ];

    protected $appends = ['url'];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function getUrlAttribute(): ?string
    {
        if (! $this->path) {
            return null;
        }

        $disk = $this->disk === 'local' ? 'public' : $this->disk;

        return Storage::disk($disk)->url($this->path);
    }
}
