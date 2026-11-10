<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class GiftCard extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id', 'code', 'initial_minor', 'balance_minor', 'currency', 'status', 'user_id',
        'recipient_name', 'recipient_phone', 'recipient_email', 'message', 'note', 'expires_at',
        'issued_by', 'source_order_id', 'meta',
    ];

    protected $hidden = ['deleted_at'];

    protected function casts(): array
    {
        return [
            'initial_minor' => 'integer',
            'balance_minor' => 'integer',
            'expires_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(GiftCardTransaction::class)->orderByDesc('id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isUsable(): bool
    {
        return $this->status === 'active'
            && (int) $this->balance_minor > 0
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    public function maskedCode(): string
    {
        $c = (string) $this->code;

        return strlen($c) <= 4 ? $c : str_repeat('•', max(0, strlen($c) - 4)).substr($c, -4);
    }
}
