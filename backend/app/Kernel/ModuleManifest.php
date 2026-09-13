<?php

namespace App\Kernel;

final class ModuleManifest
{
    /**
     * @param  list<string>  $submodules
     * @param  list<string>  $siteTypes
     * @param  list<string>  $publicRoutes
     */
    public function __construct(
        public readonly string $slug,
        public readonly ?string $parent,
        public readonly array $submodules,
        public readonly array $siteTypes,
        public readonly ?array $adminNav,
        public readonly array $publicRoutes,
        public readonly string $nameFa,
        public readonly string $nameEn,
        public readonly string $distribution = 'bundled',
    ) {}

    /** @param  array<string, mixed>  $data */
    public static function fromArray(array $data): self
    {
        $distribution = (string) ($data['distribution'] ?? 'bundled');
        if (! in_array($distribution, ['bundled', 'git'], true)) {
            $distribution = 'bundled';
        }

        return new self(
            slug: (string) ($data['slug'] ?? ''),
            parent: isset($data['parent']) ? (string) $data['parent'] : null,
            submodules: array_values($data['submodules'] ?? []),
            siteTypes: array_values($data['site_types'] ?? []),
            adminNav: isset($data['admin_nav']) ? (array) $data['admin_nav'] : null,
            publicRoutes: array_values($data['public_routes'] ?? []),
            nameFa: (string) ($data['name_fa'] ?? $data['slug'] ?? ''),
            nameEn: (string) ($data['name_en'] ?? $data['slug'] ?? ''),
            distribution: $distribution,
        );
    }

    public function isGitDistributed(): bool
    {
        return $this->distribution === 'git';
    }

    public function requiresLicense(): bool
    {
        return $this->isGitDistributed();
    }
}
