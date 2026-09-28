<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SmsScheduledSend extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELLED = 'cancelled';

    public const ID_PREFIX = 'local-';

    protected $fillable = [
        'tenant_id',
        'path',
        'payload',
        'message',
        'from_number',
        'recipients',
        'send_at',
        'status',
        'result',
        'error',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'recipients' => 'array',
            'result' => 'array',
            'send_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function outboxId(): string
    {
        return self::ID_PREFIX.$this->id;
    }
}
