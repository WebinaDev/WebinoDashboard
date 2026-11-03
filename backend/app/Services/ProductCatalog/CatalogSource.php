<?php

namespace App\Services\ProductCatalog;

/**
 * External product database adapter (Digikala / Torob / Technolife / …).
 */
interface CatalogSource
{
    public function key(): string;

    /** ready | stub | needs_credentials */
    public function status(): string;

    public function labelFa(): string;

    public function labelEn(): string;

    /** Short operator-facing note (credentials, URL-only, etc.). */
    public function hintFa(): string;

    public function hintEn(): string;

    /**
     * Optional dashboard path for API keys / connector settings (relative to /dashboard).
     * Empty when the public catalog needs no credentials.
     */
    public function settingsPath(): string;

    /**
     * @return array{
     *   items: list<array<string, mixed>>,
     *   page: int,
     *   has_more: bool,
     *   status: string,
     *   message?: string|null
     * }
     */
    public function search(string $query, int $page = 1): array;
}
