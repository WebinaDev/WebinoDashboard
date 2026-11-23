<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One audited change.
 *
 * Rows are written by {@see \App\Support\Audit\RecordsActivity} and are append-only: nothing
 * in the application updates or deletes them, which is what makes the trail trustworthy.
 */
class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    public const ACTOR_USER = 'user';

    public const ACTOR_SYSTEM = 'system';

    public const ACTOR_AGENT = 'agent';

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'actor_id',
        'actor_type',
        'actor_name',
        'subject_type',
        'subject_id',
        'subject_label',
        'event',
        'changes',
        'description',
        'ip_address',
        'user_agent',
        'url',
        'method',
        'batch_id',
    ];

    protected function casts(): array
    {
        return [
            'changes' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /** Restrict to one tenant. Called explicitly; there is no global scope on purpose. */
    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where('tenant_id', $tenantId);
    }

    /**
     * Accepts either a class name or the short name the recorder stores.
     *
     * Callers naturally reach for `CafeShift::class`; stored rows hold `CafeShift`. Both
     * work here so a query cannot silently return nothing because of the difference.
     */
    public function scopeForSubject(Builder $query, string $subjectType, int|string|null $subjectId): Builder
    {
        return $query
            ->whereIn('subject_type', array_unique([$subjectType, class_basename($subjectType)]))
            ->where('subject_id', $subjectId);
    }

    public function scopeEvent(Builder $query, string $event): Builder
    {
        return $query->where('event', $event);
    }

    /**
     * A field-level diff rendered for the UI.
     *
     * @return list<array{field: string, before: mixed, after: mixed}>
     */
    public function changeRows(): array
    {
        $changes = $this->changes;

        if (! is_array($changes)) {
            return [];
        }

        $rows = [];

        foreach ($changes as $field => $pair) {
            if (! is_array($pair)) {
                continue;
            }

            $rows[] = [
                'field' => (string) $field,
                'before' => $pair['before'] ?? null,
                'after' => $pair['after'] ?? null,
            ];
        }

        return $rows;
    }
}
