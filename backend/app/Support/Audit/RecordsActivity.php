<?php

namespace App\Support\Audit;

use Illuminate\Database\Eloquent\Model;

/**
 * Records create / update / delete for a model into the activity trail.
 *
 * Usage on a model:
 *   use RecordsActivity;
 *   protected array $activityHidden = ['totals'];   // optional: fields to keep out
 *
 * The trait deliberately does not audit reads. Recording every `SELECT` would bury the
 * changes that matter and turn the trail into a request log.
 */
trait RecordsActivity
{
    public static function bootRecordsActivity(): void
    {
        static::created(function (Model $model): void {
            ActivityRecorder::record(
                $model,
                'created',
                self::activityForCreate($model),
                self::activityDescription('created'),
            );
        });

        static::updated(function (Model $model): void {
            $changes = ActivityRecorder::diff(
                self::activityBefore($model),
                self::activityAuditable($model),
            );

            if ($changes === []) {
                return;
            }

            ActivityRecorder::record($model, 'updated', $changes, self::activityDescription('updated'));
        });

        static::deleted(function (Model $model): void {
            ActivityRecorder::record(
                $model,
                'deleted',
                self::activityForCreate($model),
                self::activityDescription('deleted'),
            );
        });
    }

    /**
     * Fields excluded from the diff for this model.
     *
     * Models override `$activityHidden` to drop payloads that are large or meaningless in a
     * trail (a frozen totals blob, a base64 image).
     *
     * @return list<string>
     */
    protected function activityHidden(): array
    {
        /** @phpstan-ignore-next-line property is declared by the using model */
        return property_exists($this, 'activityHidden') && is_array($this->activityHidden)
            ? $this->activityHidden
            : [];
    }

    /** @return array<string, mixed> */
    private static function activityAuditable(Model $model): array
    {
        $hidden = $model->activityHidden();
        $attributes = $model->getAttributes();

        return array_filter(
            $attributes,
            static fn (string $key): bool => ! in_array($key, $hidden, true),
            ARRAY_FILTER_USE_KEY,
        );
    }

    /**
     * The original values for attributes that changed.
     *
     * `getOriginal()` is a full snapshot of the model as loaded, so it is intersected with
     * the changed keys to keep the diff small.
     *
     * @return array<string, mixed>
     */
    private static function activityBefore(Model $model): array
    {
        $hidden = $model->activityHidden();
        $before = [];

        foreach (array_keys($model->getChanges()) as $key) {
            if (in_array($key, $hidden, true)) {
                continue;
            }

            $before[$key] = $model->getOriginal($key);
        }

        return $before;
    }

    /** @return array<string, array{before: mixed, after: mixed}> */
    private static function activityForCreate(Model $model): array
    {
        $rows = [];

        foreach (self::activityAuditable($model) as $key => $value) {
            $rows[$key] = ['before' => null, 'after' => $value];
        }

        return $rows;
    }

    private static function activityDescription(string $event): string
    {
        return $event;
    }
}
