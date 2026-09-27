<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Storage;

class MediaAsset extends Model
{
    protected $fillable = [
        'tenant_id',
        'folder',
        'folder_term_id',
        'path',
        'disk',
        'mime',
        'size',
        'alt',
        'original_name',
        'title',
        'slug',
        'caption',
        'description',
    ];

    protected $appends = ['url'];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function folderTerm(): BelongsTo
    {
        return $this->belongsTo(MediaTerm::class, 'folder_term_id');
    }

    public function terms(): BelongsToMany
    {
        return $this->belongsToMany(MediaTerm::class, 'media_asset_term');
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
