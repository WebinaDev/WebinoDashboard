<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Generates a WebP sibling for raster uploads (JPEG / PNG / non-animated GIF).
 * The original file is never modified; failures return null so uploads never break.
 */
class WebpConverter
{
    public const CONVERTIBLE = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/gif'];

    public function __construct(
        private int $quality = 80,
        private int $maxWidth = 2000,
    ) {}

    public static function supported(): bool
    {
        return function_exists('imagewebp') && function_exists('imagecreatefromstring');
    }

    public function isConvertible(?string $mime): bool
    {
        return in_array(strtolower((string) $mime), self::CONVERTIBLE, true);
    }

    public static function webpPathFor(string $path): string
    {
        $info = pathinfo($path);
        $dir = ($info['dirname'] ?? '.') === '.' ? '' : $info['dirname'].'/';

        return $dir.$info['filename'].'.webp';
    }

    /**
     * @return array{path: string, size: int}|null
     */
    public function convert(string $disk, string $path, ?string $mime = null): ?array
    {
        if (! self::supported()) {
            return null;
        }
        $fs = Storage::disk($disk);
        if (! $fs->exists($path)) {
            return null;
        }
        $bytes = $fs->get($path);
        if (! is_string($bytes) || $bytes === '') {
            return null;
        }
        $mime ??= (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: null;
        if (! $this->isConvertible($mime)) {
            return null;
        }
        if (str_contains((string) $mime, 'gif') && self::isAnimatedGif($bytes)) {
            return null;
        }

        $target = self::webpPathFor($path);
        if ($target === $path) {
            return null;
        }

        $img = @imagecreatefromstring($bytes);
        if ($img === false) {
            return null;
        }

        try {
            $w = imagesx($img);
            $h = imagesy($img);
            if ($w > $this->maxWidth) {
                $nh = max(1, (int) round($h * $this->maxWidth / $w));
                $scaled = imagescale($img, $this->maxWidth, $nh, IMG_BICUBIC);
                if ($scaled !== false) {
                    imagedestroy($img);
                    $img = $scaled;
                }
            }
            if (! imageistruecolor($img)) {
                imagepalettetotruecolor($img);
            }
            imagealphablending($img, false);
            imagesavealpha($img, true);

            ob_start();
            $ok = imagewebp($img, null, $this->quality);
            $out = (string) ob_get_clean();
            if (! $ok || $out === '') {
                return null;
            }
            $fs->put($target, $out);

            return ['path' => $target, 'size' => strlen($out)];
        } catch (\Throwable $e) {
            Log::warning('webp conversion failed', ['path' => $path, 'error' => $e->getMessage()]);

            return null;
        } finally {
            if ($img instanceof \GdImage) {
                imagedestroy($img);
            }
        }
    }

    public static function isAnimatedGif(string $bytes): bool
    {
        return preg_match_all('#\x00\x21\xF9\x04.{4}\x00[\x2C\x21]#s', $bytes) > 1;
    }

    /**
     * Convert a media asset in place: path/mime/size point at the WebP, original kept in original_path.
     * Idempotent: assets already converted (or already WebP) are skipped.
     */
    public function applyToAsset(\App\Models\MediaAsset $asset, bool $dryRun = false): bool
    {
        if ($asset->original_path || ! $asset->path || ! $this->isConvertible($asset->mime)) {
            return false;
        }
        $disk = $asset->disk === 'local' ? 'public' : ($asset->disk ?: 'public');
        if ($dryRun) {
            return Storage::disk($disk)->exists($asset->path);
        }
        $res = $this->convert($disk, $asset->path, $asset->mime);
        if ($res === null) {
            return false;
        }
        $asset->forceFill([
            'original_path' => $asset->path,
            'original_mime' => $asset->mime,
            'path' => $res['path'],
            'mime' => 'image/webp',
            'size' => $res['size'],
        ])->save();
        WebpLinkRewriter::forget((int) $asset->tenant_id);

        return true;
    }
}
