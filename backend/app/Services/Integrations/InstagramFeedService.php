<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Fetches recent Instagram media via Graph API, mirrors thumbnails into
 * storage/app/public (Instagram CDN is often blocked in Iran), and caches 1–6h.
 */
final class InstagramFeedService
{
    private const GRAPH = 'https://graph.facebook.com/v21.0';

    /**
     * @return array{items: list<array<string, mixed>>, configured: bool, handle: string, profile_url: string, message: string|null}
     */
    public function feed(int $tenantId, ?string $handleOverride = null, int $limit = 8): array
    {
        $settings = InstagramSettings::get($tenantId);
        $handle = ltrim((string) ($handleOverride ?: ($settings['handle'] ?? '')), '@');
        $profileUrl = $handle !== '' ? 'https://www.instagram.com/'.$handle.'/' : 'https://www.instagram.com/';
        $token = InstagramSettings::rawToken($tenantId);
        $igUserId = (string) ($settings['ig_user_id'] ?? '');
        $enabled = ! empty($settings['enabled']);
        $limit = max(1, min(24, $limit));

        if (! $enabled || $token === '' || $igUserId === '') {
            return [
                'items' => [],
                'configured' => false,
                'handle' => $handle,
                'profile_url' => $profileUrl,
                'message' => 'برای نمایش فید زنده اینستاگرام، توکن Graph و شناسه حساب را در تنظیمات سایت وارد کنید.',
            ];
        }

        $cacheHours = max(1, min(6, (int) ($settings['cache_hours'] ?? 3)));
        $cacheKey = "instagram_feed:{$tenantId}:{$igUserId}:{$limit}";

        /** @var array{items: list<array<string, mixed>>}|null $cached */
        $cached = Cache::get($cacheKey);
        if (is_array($cached) && isset($cached['items'])) {
            return [
                'items' => $cached['items'],
                'configured' => true,
                'handle' => $handle,
                'profile_url' => $profileUrl,
                'message' => null,
            ];
        }

        try {
            $items = $this->fetchAndMirror($tenantId, $igUserId, $token, $limit);
            Cache::put($cacheKey, ['items' => $items], now()->addHours($cacheHours));

            return [
                'items' => $items,
                'configured' => true,
                'handle' => $handle,
                'profile_url' => $profileUrl,
                'message' => null,
            ];
        } catch (\Throwable $e) {
            Log::warning('instagram.feed_failed', [
                'tenant_id' => $tenantId,
                'error' => $e->getMessage(),
            ]);

            return [
                'items' => [],
                'configured' => true,
                'handle' => $handle,
                'profile_url' => $profileUrl,
                'message' => 'دریافت فید اینستاگرام الان ممکن نیست. بعدا دوباره تلاش کنید.',
            ];
        }
    }

    /**
     * @return list<array{id: string, caption: string, href: string, image: string, media_type: string}>
     */
    private function fetchAndMirror(int $tenantId, string $igUserId, string $token, int $limit): array
    {
        $response = Http::timeout(20)
            ->get(self::GRAPH.'/'.$igUserId.'/media', [
                'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
                'limit' => $limit,
                'access_token' => $token,
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Graph API HTTP '.$response->status());
        }

        $data = $response->json('data');
        if (! is_array($data)) {
            return [];
        }

        $out = [];
        foreach ($data as $row) {
            if (! is_array($row)) {
                continue;
            }
            $id = (string) ($row['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $type = (string) ($row['media_type'] ?? 'IMAGE');
            $remote = (string) (($type === 'VIDEO' ? ($row['thumbnail_url'] ?? null) : null) ?: ($row['media_url'] ?? '') ?: ($row['thumbnail_url'] ?? ''));
            if ($remote === '') {
                continue;
            }
            $local = $this->mirror($tenantId, $id, $remote);
            $out[] = [
                'id' => $id,
                'caption' => (string) ($row['caption'] ?? ''),
                'href' => (string) ($row['permalink'] ?? ''),
                'image' => $local ?: $remote,
                'media_type' => $type,
            ];
        }

        return $out;
    }

    private function mirror(int $tenantId, string $mediaId, string $remoteUrl): string
    {
        $disk = Storage::disk('public');
        $dir = "instagram/{$tenantId}";
        $path = "{$dir}/{$mediaId}.jpg";

        if ($disk->exists($path)) {
            return $disk->url($path);
        }

        try {
            $bin = Http::timeout(25)->withHeaders([
                'User-Agent' => 'WebinaInstagramMirror/1.0',
            ])->get($remoteUrl);
            if (! $bin->successful() || $bin->body() === '') {
                return '';
            }
            if (! $disk->exists($dir)) {
                $disk->makeDirectory($dir);
            }
            $disk->put($path, $bin->body());

            return $disk->url($path);
        } catch (\Throwable $e) {
            Log::notice('instagram.mirror_failed', [
                'tenant_id' => $tenantId,
                'media_id' => $mediaId,
                'error' => $e->getMessage(),
            ]);

            return '';
        }
    }

    public function forgetCache(int $tenantId): void
    {
        $settings = InstagramSettings::get($tenantId);
        $igUserId = (string) ($settings['ig_user_id'] ?? '');
        if ($igUserId === '') {
            return;
        }
        foreach ([4, 8, 12, 16, 24] as $limit) {
            Cache::forget("instagram_feed:{$tenantId}:{$igUserId}:{$limit}");
        }
    }
}
