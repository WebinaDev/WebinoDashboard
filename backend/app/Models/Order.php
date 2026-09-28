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
        'awaiting_gateway',
        'on_hold',
        'paid',
        'payment_failed',
        'processing',
        'sent-to-warehouse',
        'webino-in-stock',
        'webino-packaged',
        'webino-courier',
        'webino-post',
        'webino-tipax',
        'webino-ready-to-ship',
        'webino-shipping',
        'shipped',
        'completed',
        'webino-returned',
        'webino-need-review',
        'webino-deleted',
        'cancelled',
        'refunded',
        'failed',
    ];

    /** @return list<string> */
    public static function allStatuses(): array
    {
        return self::STATUSES;
    }

    public function trackingCode(): ?string
    {
        $meta = is_array($this->meta) ? $this->meta : [];

        $code = $meta['tracking_code'] ?? $meta['tapin']['barcode'] ?? null;

        return $code !== null && $code !== '' ? (string) $code : null;
    }

    public function trackingUrl(): ?string
    {
        $meta = is_array($this->meta) ? $this->meta : [];

        $url = $meta['tracking_url'] ?? $meta['tapin']['tracking_url'] ?? null;

        return $url !== null && $url !== '' ? (string) $url : null;
    }

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
        'tax_minor',
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
            'tax_minor' => 'integer',
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
