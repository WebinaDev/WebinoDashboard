<?php

namespace App\Models\Membership;

use Illuminate\Database\Eloquent\Model;

/** A media item a user downloaded (one row per user and item; counts toward the free quota). */
class MembershipDownload extends Model
{
    protected $fillable = ['tenant_id', 'user_id', 'media_id', 'kind'];

    protected $casts = ['media_id' => 'integer'];
}
