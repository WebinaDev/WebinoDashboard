<?php

namespace App\Support\Audit;

use Illuminate\Support\Str;

/**
 * Correlates every activity row produced by a single request.
 *
 * A bulk price change or a Wordpress import touches many records; without a shared id the
 * trail reads as unrelated edits. Resolved lazily per request and cleared on `finally` by
 * the middleware that adopts it.
 */
final class AuditBatch
{
    private static ?string $id = null;

    public static function current(): ?string
    {
        if (self::$id !== null) {
            return self::$id;
        }

        // Only a live HTTP request has a batch; console commands stay untagged so a long
        // migration does not look like one giant edit.
        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return null;
        }

        return self::$id = (string) Str::uuid();
    }

    public static function reset(): void
    {
        self::$id = null;
    }
}
