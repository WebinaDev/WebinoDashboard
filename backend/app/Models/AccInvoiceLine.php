<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccInvoiceLine extends Model
{
    protected $table = 'accounting_invoice_lines';

    protected $fillable = [
        'invoice_id',
        'product_id',
        'description',
        'sku',
        'sstid',
        'qty',
        'unit_price_minor',
        'discount_minor',
        'tax_minor',
        'vat_rate',
        'total_minor',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'float',
            'unit_price_minor' => 'integer',
            'discount_minor' => 'integer',
            'tax_minor' => 'integer',
            'vat_rate' => 'float',
            'total_minor' => 'integer',
            'meta' => 'array',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(AccInvoice::class, 'invoice_id');
    }
}
