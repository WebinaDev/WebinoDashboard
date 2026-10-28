<?php

namespace App\Services\WordpressImport;

final class ImportOutcome
{
    public function __construct(
        public readonly string $action,
        public readonly ?string $localType = null,
        public readonly ?int $localId = null,
        public readonly ?string $message = null,
        /** Saved, but part of it (e.g. images) failed: mark the item failed so --retry-failed re-runs it. */
        public readonly bool $retry = false,
    ) {}
}
