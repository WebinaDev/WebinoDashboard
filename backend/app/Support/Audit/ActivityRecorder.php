<?php

namespace App\Support\Audit;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Str;

/**
 * Writes the rows behind the activity trail.
 *
 * Two rules decide whether a change is recorded at all:
 *  - attributes that did not move are dropped, so a save that only touches `updated_at`
 *    leaves no noise;
 *  - sensitive attributes are recorded as a redaction marker, never by value.
 *
 * The recorder never throws into the caller: an audit failure must not roll back a sale.
 * It does log itself, because a silently broken trail is worse than a loud one.
 */
final class ActivityRecorder
{
    /**
     * Attribute names whose values must never be stored.
     *
     * Matched as a substring so `password_confirmation` and `api_token` are covered without
     * maintaining an exhaustive list.
     *
     * @var list<string>
     */
    private const REDACTED = [
        'password',
        'remember_token',
        'api_token',
        'secret',
        'private_key',
        'card_number',
        'cvv',
    ];

    /** Columns that describe bookkeeping rather than intent. */
    private const IGNORED = [
        'updated_at',
        'created_at',
        'deleted_at',
    ];

    public static function record(
        Model $subject,
        string $event,
        ?array $changes = null,
        ?string $description = null,
    ): ?ActivityLog {
        try {
            $actor = self::actor();

            return ActivityLog::query()->create([
                'tenant_id' => self::tenantId($subject, $actor),
                'branch_id' => self::attribute($subject, 'branch_id'),
                'actor_id' => $actor?->id,
                'actor_type' => $actor ? ActivityLog::ACTOR_USER : ActivityLog::ACTOR_SYSTEM,
                'actor_name' => $actor?->name,
                'subject_type' => class_basename($subject),
                'subject_id' => $subject->getKey(),
                'subject_label' => self::label($subject),
                'event' => $event,
                'changes' => self::sanitize($changes),
                'description' => $description,
                'ip_address' => self::requestValue('ip'),
                'user_agent' => self::requestValue('userAgent'),
                'url' => self::requestValue('url'),
                'method' => self::requestValue('method'),
                'batch_id' => AuditBatch::current(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * Diff two attribute sets into `{field: {before, after}}`.
     *
     * Only fields present in `$after` are considered changed, which is what makes this safe
     * to call from `updated` where the model already holds the new values.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @return array<string, array{before: mixed, after: mixed}>
     */
    public static function diff(array $before, array $after): array
    {
        $changes = [];

        foreach ($after as $field => $newValue) {
            if (in_array($field, self::IGNORED, true)) {
                continue;
            }

            $oldValue = $before[$field] ?? null;

            if (! self::isEqual($oldValue, $newValue)) {
                $changes[$field] = ['before' => $oldValue, 'after' => $newValue];
            }
        }

        return $changes;
    }

    /**
     * @param  array<string, array{before: mixed, after: mixed}>|null  $changes
     * @return array<string, array{before: mixed, after: mixed}>|null
     */
    private static function sanitize(?array $changes): ?array
    {
        if ($changes === null || $changes === []) {
            return null;
        }

        foreach ($changes as $field => $pair) {
            if (self::isSensitive((string) $field)) {
                $changes[$field] = ['before' => '[redacted]', 'after' => '[redacted]'];
            }
        }

        return $changes;
    }

    private static function isSensitive(string $field): bool
    {
        $needle = Str::lower($field);

        foreach (self::REDACTED as $pattern) {
            if (str_contains($needle, $pattern)) {
                return true;
            }
        }

        return false;
    }

    private static function isEqual(mixed $old, mixed $new): bool
    {
        // Eloquent hands back string casts; compare the serialised forms so `1` and "1" do
        // not read as a change.
        if (is_array($old) || is_array($new)) {
            return json_encode($old) === json_encode($new);
        }

        if ($old instanceof \DateTimeInterface || $new instanceof \DateTimeInterface) {
            return (string) $old === (string) $new;
        }

        return (string) self::scalar($old) === (string) self::scalar($new);
    }

    private static function scalar(mixed $value): mixed
    {
        return is_bool($value) ? (int) $value : $value;
    }

    private static function actor(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }

    private static function tenantId(Model $subject, ?User $actor): ?int
    {
        $fromSubject = self::attribute($subject, 'tenant_id');

        if ($fromSubject !== null) {
            return (int) $fromSubject;
        }

        return $actor?->tenant_id !== null ? (int) $actor->tenant_id : null;
    }

    private static function attribute(Model $subject, string $key): mixed
    {
        return $subject->getAttribute($key);
    }

    /** A human handle for the record, so a row reads "Order #1042" rather than "Order 42". */
    private static function label(Model $subject): ?string
    {
        foreach (['number', 'name', 'title', 'code', 'slug'] as $key) {
            $value = self::attribute($subject, $key);

            if (is_scalar($value) && trim((string) $value) !== '') {
                return Str::limit((string) $value, 120);
            }
        }

        return null;
    }

    private static function requestValue(string $key): ?string
    {
        try {
            $request = Request::instance();
        } catch (\Throwable) {
            return null;
        }

        $value = match ($key) {
            'ip' => $request->ip(),
            'userAgent' => $request->userAgent(),
            'url' => $request->fullUrl(),
            'method' => $request->method(),
            default => null,
        };

        return is_string($value) ? Str::limit($value, 250, '') : null;
    }
}
