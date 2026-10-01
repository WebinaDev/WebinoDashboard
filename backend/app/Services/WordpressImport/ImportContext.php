<?php

namespace App\Services\WordpressImport;

use App\Models\MediaAsset;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportLink;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;

final class ImportContext
{
    public function __construct(
        public readonly WordpressImportJob $job,
        public readonly WordpressImportMapper $mapper,
        public readonly RemoteAssetFetcher $fetcher,
    ) {}

    public function tenantId(): int
    {
        return (int) $this->job->tenant_id;
    }

    public function dryRun(): bool
    {
        return (bool) $this->job->dry_run;
    }

    public function publishContent(): bool
    {
        return (bool) ($this->job->options['publish_content'] ?? false);
    }

    public function downloadMedia(): bool
    {
        return (bool) ($this->job->options['download_media'] ?? true);
    }

    /** @return list<string> */
    public function hosts(): array
    {
        $hosts = [];
        $source = parse_url((string) $this->job->source_url, PHP_URL_HOST);
        if (is_string($source) && $source !== '') {
            $hosts[] = strtolower($source);
        }
        $extra = $this->job->options['media_hosts'] ?? [];
        if (is_array($extra)) {
            foreach ($extra as $host) {
                if (is_string($host) && trim($host) !== '') {
                    $hosts[] = strtolower(trim($host));
                }
            }
        }

        return array_values(array_unique($hosts));
    }

    public function sourceHost(): ?string
    {
        $host = parse_url((string) $this->job->source_url, PHP_URL_HOST);

        return is_string($host) && $host !== '' ? strtolower($host) : null;
    }

    public function currency(array $payload): string
    {
        $currency = (string) ($payload['currency'] ?? $this->job->options['currency'] ?? 'IRT');
        $currency = strtoupper(trim($currency));

        return $currency !== '' ? mb_substr($currency, 0, 8) : 'IRT';
    }

    public function minor(array $payload, string $key): int
    {
        $multiplier = (float) ($this->job->options['price_multiplier'] ?? 1);

        return $this->mapper->toMinor($payload, $key, $this->currency($payload), $multiplier);
    }

    public function find(string $resource, string $externalId): ?WordpressImportLink
    {
        if ($externalId === '') {
            return null;
        }

        return WordpressImportLink::query()
            ->where('tenant_id', $this->tenantId())
            ->where('resource', $resource)
            ->where('external_id', $externalId)
            ->first();
    }

    public function link(string $resource, string $externalId, string $localType, int $localId, ?string $guid = null): void
    {
        if ($this->dryRun()) {
            return;
        }

        WordpressImportLink::query()->updateOrCreate(
            [
                'tenant_id' => $this->tenantId(),
                'resource' => $resource,
                'external_id' => $externalId,
            ],
            [
                'source_guid' => $guid,
                'local_type' => $localType,
                'local_id' => $localId,
            ]
        );
    }

    public function outcome(string $existed, string $localType, ?int $localId, ?string $message = null): ImportOutcome
    {
        if ($this->dryRun()) {
            return new ImportOutcome($existed ? 'would_update' : 'would_create', $localType, $localId, $message);
        }

        return new ImportOutcome($existed ? 'updated' : 'created', $localType, $localId, $message);
    }

    /** @param  class-string  $modelClass */
    public function uniqueSlug(string $modelClass, string $slug, ?int $ignoreId = null): string
    {
        $base = $slug !== '' ? $slug : 'item';
        for ($i = 0; $i < 40; $i++) {
            $candidate = $i === 0 ? $base : mb_substr($base, 0, 170).'-'.($i + 1);
            $query = $modelClass::query()->where('tenant_id', $this->tenantId())->where('slug', $candidate);
            if ($ignoreId) {
                $query->whereKeyNot($ignoreId);
            }
            if (! $query->exists()) {
                return $candidate;
            }
        }

        return mb_substr($base, 0, 150).'-'.substr(sha1($base), 0, 8);
    }

    /**
     * Store an image from base64 or an allowlisted URL. Returns the public URL.
     *
     * @param  array<string, mixed>  $image
     */
    public function storeImage(array $image, ?string $fallbackExternalId = null): ?string
    {
        $externalId = trim((string) ($image['external_id'] ?? $fallbackExternalId ?? ''));
        if ($externalId !== '') {
            $existing = $this->find('media', $externalId);
            if ($existing && $existing->local_type === MediaAsset::class) {
                $asset = MediaAsset::query()->where('tenant_id', $this->tenantId())->find($existing->local_id);
                if ($asset) {
                    return $asset->url;
                }
            }
        }

        $bytes = null;
        $mime = null;
        $filename = null;
        if (! empty($image['data_base64']) && is_string($image['data_base64'])) {
            $raw = $image['data_base64'];
            if (str_contains($raw, ',')) {
                $raw = substr($raw, (int) strrpos($raw, ',') + 1);
            }
            $decoded = base64_decode($raw, true);
            if ($decoded === false || $decoded === '' || strlen($decoded) > 8388608) {
                throw new InvalidArgumentException('Image data is invalid or too large.');
            }
            $bytes = $decoded;
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
            if (! in_array($mime, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)) {
                throw new InvalidArgumentException('Image data must be JPEG, PNG, GIF, or WebP.');
            }
            $filename = $this->cleanFilename((string) ($image['filename'] ?? 'image'));
        } elseif (! empty($image['url']) && is_string($image['url'])) {
            if (! ImportUrlGuard::hostAllowed(
                ImportUrlGuard::parseHttp($image['url'])['host'],
                $this->hosts()
            )) {
                throw new InvalidArgumentException('Image host is not on the allowlist.');
            }
            if ($this->dryRun() || ! $this->downloadMedia()) {
                return null;
            }
            $fetched = $this->fetcher->fetch($image['url'], $this->hosts());
            $bytes = $fetched->body;
            $mime = $fetched->mime;
            $filename = $fetched->filename;
        } else {
            return null;
        }

        if ($this->dryRun()) {
            return null;
        }

        $ext = match ($mime) {
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        if (! str_ends_with(strtolower((string) $filename), '.'.$ext)) {
            $filename = pathinfo((string) $filename, PATHINFO_FILENAME).'.'.$ext;
        }
        $name = ($externalId !== '' ? $externalId.'-' : '').$filename;
        $path = 'media/'.$this->tenantId().'/wordpress/'.$name;
        Storage::disk('public')->put($path, $bytes);

        $asset = new MediaAsset([
            'tenant_id' => $this->tenantId(),
            'folder' => 'wordpress',
            'path' => $path,
            'disk' => 'public',
            'mime' => $mime,
            'size' => strlen($bytes),
            'alt' => isset($image['alt']) ? mb_substr((string) $image['alt'], 0, 255) : null,
            'original_name' => $filename,
            'title' => isset($image['title']) ? mb_substr((string) $image['title'], 0, 255) : pathinfo($filename, PATHINFO_FILENAME),
            'slug' => $this->uniqueSlug(MediaAsset::class, $this->mapper->slug(
                isset($image['slug']) ? (string) $image['slug'] : null,
                (string) ($image['title'] ?? $filename)
            )),
        ]);
        $asset->save();
        if ($externalId !== '') {
            $this->link('media', $externalId, MediaAsset::class, (int) $asset->id, isset($image['source_guid']) ? (string) $image['source_guid'] : null);
        }

        return $asset->url;
    }

    private function cleanFilename(string $name): string
    {
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', $name) ?? 'image';
        $name = trim($name, '-.');

        return $name !== '' ? mb_substr($name, 0, 80) : 'image-'.Str::lower(Str::random(6));
    }
}
