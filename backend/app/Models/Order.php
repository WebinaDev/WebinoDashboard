<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;

    public const STATUSES = [
        'pending_payment',
        'on_hold',
        'paid',
        'payment_failed',
        'processing',
        'shipped',
        'completed',
        'cancelled',
        'refunded',
        'failed',
    ];

    protected $fillable = [
        'tenant_id',
        'user_id',
        'created_by',
        'number',
        'status',
        'total_minor',
        'subtotal_minor',
        'discount_minor',
        'shipping_minor',
        'amount_paid_minor',
        'currency',
        'payment_provider',
        'payment_ref',
        'payment_tender',
        'payment_url',
        'shipping_address',
        'billing_address',
        'customer_phone',
        'customer_name',
        'customer_email',
        'customer_note',
        'coupon_code',
        'coupon_id',
        'table_number',
        'branch_slug',
        'meta',
        'sales_channel',
        'is_pos',
        'is_pay_link',
        'buyer_tax',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'printed_at',
        'c2c_status',
        'c2c_receipt_url',
        'c2c_decided_by',
        'c2c_decided_at',
    ];

    protected function casts(): array
    {
        return [
            'total_minor' => 'integer',
            'subtotal_minor' => 'integer',
            'discount_minor' => 'integer',
            'shipping_minor' => 'integer',
            'amount_paid_minor' => 'integer',
            'meta' => 'array',
            'buyer_tax' => 'array',
            'billing_address' => 'array',
            'is_pos' => 'boolean',
            'is_pay_link' => 'boolean',
            'printed_at' => 'datetime',
            'c2c_decided_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(OrderNote::class)->orderByDesc('id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(OrderReturn::class)->orderByDesc('id');
    }
}
