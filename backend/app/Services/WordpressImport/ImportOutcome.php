<?php

namespace App\Services\WordpressImport;

final class ImportOutcome
{
    public function __construct(
        public readonly string $action,
        public readonly ?string $localType = null,
        public readonly ?int $localId = null,
        public readonly ?string $message = null,
    ) {}
}
