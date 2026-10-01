<?php

namespace App\Services\WordpressImport;

final class FetchedAsset
{
    public function __construct(
        public readonly string $body,
        public readonly string $mime,
        public readonly string $filename,
    ) {}
}
