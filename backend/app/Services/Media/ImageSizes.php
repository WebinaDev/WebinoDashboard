<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Responsive image sizes. The stored image is the ~1600px hero/max; a ~800px WebP «card»
 * sibling (`name-800w.webp`) is generated next to it for product cards/listings (srcset).
 */
class ImageSizes
{
    public const CARD = 800;

    public const SUFFIX = '-800w.webp';

    private const RASTER = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif'];

    public static function cardPathFor(string $path): string
    {
        $info = pathinfo($path);
        $dir = ($info['dirname'] ?? '.') === '.' ? '' : $info['dirname'].'/';

        return $dir.$info['filename'].self::SUFFIX;
    }

    public static function isCardPath(string $path): bool
    {
        return str_ends_with($path, self::SUFFIX);
    }

    /** Public-disk URL of the card size for a stored image URL, when that file exists. */
    public static function cardUrlFor(?string $url): ?string
    {
        if (! $url) {
            return null;
        }
        $base = rtrim(Storage::disk('public')->url(''), '/').'/';
        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        $basePath = parse_url($base, PHP_URL_PATH) ?: '/storage/';
        if (! str_starts_with($path, $basePath)) {
            return null;
        }
        $rel = rawurldecode(substr($path, strlen($basePath)));
        if ($rel === '' || self::isCardPath($rel)) {
            return null;
        }
        $card = self::cardPathFor($rel);
        try {
            if (! Storage::disk('public')->exists($card)) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        }
        $prefix = str_starts_with($url, 'http') ? substr($url, 0, strlen($url) - strlen($path)) : '';

        return $prefix.$basePath.str_replace('%2F', '/', rawurlencode($card));
    }

    /**
     * Generate the card size. Returns the card path, or null when not needed (image already ≤ 800px,
     * non-raster, animated GIF) or unsupported. Idempotent unless $force.
     */
    public function generate(string $disk, string $path, bool $force = false): ?string
    {
        if (self::isCardPath($path) || ! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }
        $fs = Storage::disk($disk === 'local' ? 'public' : $disk);
        $target = self::cardPathFor($path);
        try {
            if (! $force && $fs->exists($target)) {
                return $target;
            }
            if (! $fs->exists($path)) {
                return null;
            }
            $bytes = (string) $fs->get($path);
        } catch (\Throwable) {
            return null;
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
        if (! in_array($mime, self::RASTER, true) || ($mime === 'image/gif' && WebpConverter::isAnimatedGif($bytes))) {
            return null;
        }
        $size = @getimagesizefromstring($bytes);
        $w = is_array($size) ? (int) $size[0] : 0;
        $h = is_array($size) ? (int) $size[1] : 0;
        if ($w <= self::CARD || $h <= 0 || $w * $h > 50_000_000) {
            return null;
        }
        $img = @imagecreatefromstring($bytes);
        if ($img === false) {
            return null;
        }
        try {
            $nh = max(1, (int) round($h * self::CARD / $w));
            $scaled = imagescale($img, self::CARD, $nh, IMG_BICUBIC);
            if ($scaled === false) {
                return null;
            }
            imagedestroy($img);
            $img = $scaled;
            imagealphablending($img, false);
            imagesavealpha($img, true);
            ob_start();
            $ok = imagewebp($img, null, 80);
            $out = (string) ob_get_clean();
            if (! $ok || $out === '') {
                return null;
            }
            $fs->put($target, $out);

            return $target;
        } catch (\Throwable $e) {
            Log::warning('card image size failed', ['path' => $path, 'error' => $e->getMessage()]);

            return null;
        } finally {
            if ($img instanceof \GdImage) {
                imagedestroy($img);
            }
        }
    }
}
