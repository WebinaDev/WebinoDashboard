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
            $hosts = array_merge($hosts, $this->hostVariants(strtolower($source)));
        }
        $extra = $this->job->options['media_hosts'] ?? [];
        if (is_array($extra)) {
            foreach ($extra as $host) {
                if (is_string($host) && trim($host) !== '') {
                    $hosts = array_merge($hosts, $this->hostVariants(strtolower(trim($host))));
                }
            }
        }

        return array_values(array_unique($hosts));
    }

    /** @return list<string> */
    private function hostVariants(string $host): array
    {
        $host = strtolower(trim($host));
        if ($host === '') {
            return [];
        }
        $out = [$host];
        if (str_starts_with($host, 'www.')) {
            $out[] = substr($host, 4);
        } else {
            $out[] = 'www.'.$host;
        }
        // Common WP CDN / cache frontends for the same origin site.
        $bare = str_starts_with($host, 'www.') ? substr($host, 4) : $host;
        foreach (['cdn.', 'media.', 'img.', 'static.'] as $prefix) {
            $out[] = $prefix.$bare;
        }

        return array_values(array_unique(array_filter($out)));
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

    public function outcome(bool $existed, string $localType, ?int $localId, ?string $message = null): ImportOutcome
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
    public const MAX_IMAGE_BYTES = 33_554_432;

    public const MAX_FILE_BYTES = 67_108_864;

    public const MAX_DIMENSION = 2000;

    private const WEB_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    public static function isRaster(string $mime): bool
    {
        return str_starts_with($mime, 'image/') && $mime !== 'image/svg+xml';
    }

    public static function isAttachment(string $mime): bool
    {
        return SafeRemoteFetcher::safeAttachment($mime);
    }

    private static function extensionFor(string $mime, string $filename): string
    {
        $ext = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext !== '' && preg_match('/^[a-z0-9]{1,5}$/', $ext) && ! in_array($ext, ['php', 'phtml', 'phar', 'html', 'htm', 'js', 'mjs', 'svg', 'xml', 'exe', 'sh'], true)) {
            return $ext;
        }
        $sub = explode('/', $mime)[1] ?? 'bin';

        return preg_match('/^[a-z0-9]{1,5}$/', $sub) ? $sub : 'bin';
    }

    /**
     * Convert to WebP when the image is not web-native, wider/taller than MAX_DIMENSION, or heavy.
     * Animated GIFs are left alone. Returns null when no conversion was possible or needed.
     *
     * @return array{0: string, 1: string}|null
     */
    public function optimizeImage(string $bytes, string $mime): ?array
    {
        if ($mime === 'image/gif') {
            return null;
        }
        $size = @getimagesizefromstring($bytes);
        $w = is_array($size) ? (int) $size[0] : 0;
        $h = is_array($size) ? (int) $size[1] : 0;
        $needs = ! in_array($mime, self::WEB_IMAGES, true)
            || max($w, $h) > self::MAX_DIMENSION
            || (strlen($bytes) > 2_097_152 && $mime !== 'image/webp');
        if (! $needs) {
            return null;
        }
        if (class_exists(\Imagick::class)) {
            try {
                $im = new \Imagick;
                $im->readImageBlob($bytes);
                $im = $im->coalesceImages()->getImage();
                $im->autoOrient();
                if (max($im->getImageWidth(), $im->getImageHeight()) > self::MAX_DIMENSION) {
                    $im->thumbnailImage(self::MAX_DIMENSION, self::MAX_DIMENSION, true);
                }
                $im->stripImage();
                $im->setImageFormat('webp');
                $im->setImageCompressionQuality(82);
                $out = $im->getImageBlob();
                $im->clear();
                if ($out !== '') {
                    return [$out, 'image/webp'];
                }
            } catch (\Throwable) {
                // fall through to GD
            }
        }
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }
        if ($w > 0 && $h > 0 && $w * $h > 50_000_000) {
            return null; // refuse decompression bombs
        }
        $src = @imagecreatefromstring($bytes);
        if ($src === false) {
            return null;
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, self::MAX_DIMENSION / max(1, $w, $h));
        $dst = $src;
        if ($scale < 1) {
            $dst = imagescale($src, max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale)), IMG_BICUBIC);
            if ($dst === false) {
                return null;
            }
        }
        imagepalettetotruecolor($dst);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        ob_start();
        $ok = imagewebp($dst, null, 82);
        $out = (string) ob_get_clean();

        return $ok && $out !== '' ? [$out, 'image/webp'] : null;
    }

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
            if ($decoded === false || $decoded === '' || strlen($decoded) > self::MAX_IMAGE_BYTES) {
                throw new InvalidArgumentException('Image data is invalid or too large.');
            }
            $bytes = $decoded;
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
            if (! self::isRaster($mime) && ! self::isAttachment($mime)) {
                throw new InvalidArgumentException('Image data must be an image or a supported file.');
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
            $fetched = $this->fetcher->fetch($image['url'], $this->hosts(), self::MAX_IMAGE_BYTES, 'media');
            $bytes = $fetched->body;
            $mime = $fetched->mime;
            $filename = $fetched->filename;
        } else {
            return null;
        }

        if ($this->dryRun()) {
            return null;
        }
        // Non-raster payloads (PDF, video, archives, SVG) are kept as file attachments.
        if (! self::isRaster((string) $mime)) {
            return $this->storeFile(array_merge($image, ['data_base64' => base64_encode($bytes), 'filename' => $filename, 'url' => null]), $externalId !== '' ? $externalId : null);
        }
        $optimized = $this->optimizeImage($bytes, (string) $mime);
        if ($optimized === null) {
            if (! in_array($mime, self::WEB_IMAGES, true)) {
                // Image-like but not decodable here (e.g. HEIC without Imagick): keep the original as a file.
                return $this->storeFile(array_merge($image, ['data_base64' => base64_encode($bytes), 'filename' => $filename, 'url' => null]), $externalId !== '' ? $externalId : null);
            }
        } else {
            [$bytes, $mime] = $optimized;
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

    /**
     * Store SVG, PDF, or video when the payload is not a raster image.
     * SVG script and event handlers are stripped. HTML uploads are refused.
     *
     * @param  array<string, mixed>  $file
     */
    public function storeFile(array $file, ?string $fallbackExternalId = null): ?string
    {
        $externalId = trim((string) ($file['external_id'] ?? $fallbackExternalId ?? ''));
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
        $max = self::MAX_FILE_BYTES;
        if (! empty($file['data_base64']) && is_string($file['data_base64'])) {
            $raw = $file['data_base64'];
            if (str_contains($raw, ',')) {
                $raw = substr($raw, (int) strrpos($raw, ',') + 1);
            }
            $decoded = base64_decode($raw, true);
            if ($decoded === false || $decoded === '' || strlen($decoded) > $max) {
                throw new InvalidArgumentException('File data is invalid or too large.');
            }
            $bytes = $decoded;
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
            $filename = $this->cleanFilename((string) ($file['filename'] ?? 'file'));
        } elseif (! empty($file['url']) && is_string($file['url'])) {
            if (! ImportUrlGuard::hostAllowed(ImportUrlGuard::parseHttp($file['url'])['host'], $this->hosts())) {
                throw new InvalidArgumentException('Media host is not on the allowlist.');
            }
            if ($this->dryRun() || ! $this->downloadMedia()) {
                return null;
            }
            $fetched = $this->fetcher->fetch($file['url'], $this->hosts(), $max, 'media');
            $bytes = $fetched->body;
            $mime = $fetched->mime;
            $filename = $fetched->filename;
        } else {
            return null;
        }

        $allowed = ['image/svg+xml', 'application/pdf', 'video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (self::isRaster((string) $mime) && ($optimized = $this->optimizeImage($bytes, (string) $mime)) !== null) {
            [$bytes, $mime] = $optimized;
        }
        if (! in_array($mime, $allowed, true) && ! self::isRaster((string) $mime) && ! self::isAttachment((string) $mime)) {
            throw new InvalidArgumentException('Unsupported media type '.$mime.'. Images, SVG, PDF, video, audio, documents and archives are accepted.');
        }
        if ($mime === 'image/svg+xml') {
            $bytes = $this->sanitizeSvg($bytes);
        }
        if ($this->dryRun()) {
            return null;
        }
        $ext = match ($mime) {
            'image/svg+xml' => 'svg',
            'application/pdf' => 'pdf',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'image/jpeg' => 'jpg',
            default => self::extensionFor((string) $mime, (string) $filename),
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
            'alt' => isset($file['alt']) ? mb_substr((string) $file['alt'], 0, 255) : null,
            'original_name' => $filename,
            'title' => isset($file['title']) ? mb_substr((string) $file['title'], 0, 255) : pathinfo((string) $filename, PATHINFO_FILENAME),
            'slug' => $this->uniqueSlug(MediaAsset::class, $this->mapper->slug(
                isset($file['slug']) ? (string) $file['slug'] : null,
                (string) ($file['title'] ?? $filename)
            )),
        ]);
        $asset->save();
        if ($externalId !== '') {
            $this->link('media', $externalId, MediaAsset::class, (int) $asset->id, isset($file['source_guid']) ? (string) $file['source_guid'] : null);
        }

        return $asset->url;
    }

    private function sanitizeSvg(string $svg): string
    {
        $svg = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $svg) ?? $svg;
        $svg = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $svg) ?? $svg;
        $svg = preg_replace('/javascript\s*:/i', '', $svg) ?? $svg;

        return $svg;
    }

    private function cleanFilename(string $name): string
    {
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', $name) ?? 'image';
        $name = trim($name, '-.');

        return $name !== '' ? mb_substr($name, 0, 80) : 'image-'.Str::lower(Str::random(6));
    }
}
