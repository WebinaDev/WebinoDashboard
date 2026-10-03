<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * WordPress-style trash: default lists hide trashed rows, delete moves to
 * trash, and a second permanent delete removes the row.
 */
final class StatusTrash
{
    public const TRASH = 'trash';

    public static function apply(Builder $query, ?string $status, string $column = 'status'): void
    {
        if ($status === null || $status === '' || $status === 'all') {
            $query->where(function (Builder $q) use ($column) {
                $q->whereNull($column)->orWhere($column, '!=', self::TRASH);
            });

            return;
        }

        $query->where($column, $status);
    }

    /**
     * @param  list<string>  $allowedRestore
     * @return array{trashed?: bool, deleted?: bool}
     */
    public static function trashOrDelete(Model $model, bool $force, string $column = 'status', string $fallback = 'draft', array $allowedRestore = []): array
    {
        $current = (string) ($model->getAttribute($column) ?? '');
        if ($force) {
            if ($current !== self::TRASH) {
                abort(422, 'Only trashed items can be permanently deleted.');
            }
            $model->delete();

            return ['deleted' => true];
        }

        if ($current === self::TRASH) {
            return ['trashed' => true];
        }

        self::rememberPrevious($model, $current);
        $model->setAttribute($column, self::TRASH);
        $model->save();

        return ['trashed' => true];
    }

    /**
     * @param  list<string>  $allowed
     */
    public static function restore(Model $model, string $column = 'status', string $fallback = 'draft', array $allowed = []): string
    {
        $meta = $model->getAttribute('meta');
        $prev = is_array($meta) ? (string) ($meta['pre_trash_status'] ?? '') : '';
        if ($prev === '' || $prev === self::TRASH || ($allowed !== [] && ! in_array($prev, $allowed, true))) {
            $prev = $fallback;
        }
        if (is_array($meta) && array_key_exists('pre_trash_status', $meta)) {
            unset($meta['pre_trash_status']);
            $model->setAttribute('meta', $meta);
        }
        $model->setAttribute($column, $prev);
        $model->save();

        return $prev;
    }

    private static function rememberPrevious(Model $model, string $current): void
    {
        if (! $model->isFillable('meta') && ! array_key_exists('meta', $model->getAttributes())) {
            return;
        }
        $meta = $model->getAttribute('meta');
        $meta = is_array($meta) ? $meta : [];
        if ($current !== '') {
            $meta['pre_trash_status'] = $current;
        }
        $model->setAttribute('meta', $meta);
    }
}
