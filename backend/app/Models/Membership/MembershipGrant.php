<?php

namespace App\Models\Membership;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One period of premium access (from a paid order or given by an admin). */
class MembershipGrant extends Model
{
    protected $fillable = ['tenant_id', 'user_id', 'plan_id', 'order_id', 'order_item_id', 'source', 'duration_value', 'duration_unit',
        'starts_at', 'ends_at', 'revoked_at', 'note', 'created_by'];

    protected $casts = ['duration_value' => 'integer', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'revoked_at' => 'datetime'];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'plan_id');
    }
}
