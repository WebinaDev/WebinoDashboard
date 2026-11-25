<?php

namespace App\Models;

use App\Support\Audit\RecordsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use RecordsActivity, SoftDeletes;

    /** Frozen payloads would bloat every row; the money fields beside them are audited. */
    protected array $activityHidden = ['totals', 'meta'];

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
        'branch_id',
        // The drawer this sale was taken at. Written once, at intake, so a sale replayed from
        // an offline till still lands in the shift it happened in.
        'shift_id',
        'stock_oversold_at',
        'paid_at',
        'user_id',
        'created_by',
        'number',
        'client_ref',
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
        'delivery_status',
        'delivery_driver_id',
        'delivery_claimed_at',
        'delivery_picked_up_at',
        'delivery_completed_at',
        'delivery_failure_reason',
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
            'stock_oversold_at' => 'datetime',
            'paid_at' => 'datetime',
            'c2c_decided_at' => 'datetime',
            'delivery_claimed_at' => 'datetime',
            'delivery_picked_up_at' => 'datetime',
            'delivery_completed_at' => 'datetime',
            'delivery_driver_id' => 'integer',
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

    /** Every tender recorded against this sale (several rows = split payment). */
    public function payments(): HasMany
    {
        return $this->hasMany(OrderPayment::class)->whereNull('superseded_at');
    }

    /** Amendment requests on a paid invoice. */
    public function amendments(): HasMany
    {
        return $this->hasMany(OrderAmendment::class);
    }

    /*
     * There is deliberately no `table()` relation here.
     *
     * Orders carry `table_number` — a *code*, not an id — because the guest QR flow and the
     * floor board both work from codes, and a code is unique per tenant rather than globally.
     * A `belongsTo` on the code cannot also constrain the tenant without a cross-table
     * `whereColumn`, and that breaks the moment the relation is eager-loaded (`orders` is not
     * in that query's FROM clause). Callers resolve the table from a tenant-scoped lookup
     * instead: see `WorkbenchService::queue()` and `OrderIntake::resolveTable()`.
     */

    /** The branch that rang this sale up. Null on legacy rows and tenant-wide online orders. */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(CafeBranch::class, 'branch_id');
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
