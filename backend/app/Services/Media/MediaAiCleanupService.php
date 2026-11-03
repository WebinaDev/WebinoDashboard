<?php

namespace App\Services\Media;

use App\Models\MediaAsset;
use Illuminate\Support\Str;

class MediaAiCleanupService
{
    /**
     * Heuristic cleanup for media metadata (slug / alt / caption / description).
     * Does not invent folder, category, or tag assignments.
     *
     * @return array{id: int, changed: array<string, mixed>, fields: list<string>}
     */
    public function fix(MediaAsset $asset): array
    {
        $changed = [];
        $sourceLabel = $this->sourceLabel($asset);

        $newSlug = $this->latinSlug($sourceLabel, $asset->id);
        if ($this->isBadSlug((string) ($asset->slug ?? '')) || trim((string) $asset->slug) === '') {
            if ($newSlug !== '' && $newSlug !== (string) $asset->slug) {
                $changed['slug'] = $newSlug;
                $asset->slug = $newSlug;
            }
        }

        if ($this->isBlank($asset->alt) && $sourceLabel !== '') {
            $changed['alt'] = $sourceLabel;
            $asset->alt = $sourceLabel;
        }

        if ($this->isBlank($asset->caption) && $sourceLabel !== '') {
            $changed['caption'] = $sourceLabel;
            $asset->caption = $sourceLabel;
        }

        if ($this->isBlank($asset->description) && $sourceLabel !== '') {
            $changed['description'] = $sourceLabel;
            $asset->description = $sourceLabel;
        }

        if ($changed !== []) {
            $asset->save();
        }

        return [
            'id' => (int) $asset->id,
            'changed' => $changed,
            'fields' => array_keys($changed),
        ];
    }

    public function isBadSlug(?string $slug): bool
    {
        $slug = trim((string) $slug);
        if ($slug === '') {
            return true;
        }
        if (preg_match('/\s/u', $slug)) {
            return true;
        }
        // Non ASCII-latin slug (Persian letters, symbols, underscores, etc.)
        if (! preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return true;
        }

        return false;
    }

    public function latinSlug(string $source, int $fallbackId = 0): string
    {
        $source = trim($source);
        $ascii = Str::slug(Str::ascii($source));
        $ascii = strtolower($ascii);
        $ascii = preg_replace('/[^a-z0-9-]+/', '', $ascii) ?? '';
        $ascii = preg_replace('/-+/', '-', $ascii) ?? '';
        $ascii = trim($ascii, '-');

        if ($ascii === '') {
            $ascii = $fallbackId > 0 ? 'file-'.$fallbackId : 'file-'.Str::lower(Str::random(6));
        }

        return $ascii;
    }

    private function sourceLabel(MediaAsset $asset): string
    {
        $title = trim((string) ($asset->title ?? ''));
        if ($title !== '') {
            return $this->humanize($title);
        }

        $name = trim((string) ($asset->original_name ?? ''));
        if ($name !== '') {
            return $this->humanize(pathinfo($name, PATHINFO_FILENAME) ?: $name);
        }

        return '';
    }

    private function humanize(string $value): string
    {
        $value = str_replace(['_', '-', '.'], ' ', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    private function isBlank(?string $value): bool
    {
        return trim((string) $value) === '';
    }
}
