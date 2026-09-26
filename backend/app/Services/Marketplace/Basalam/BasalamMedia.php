<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Basalam media upload (port of MediaUploadService + FileUploader + PhotoService/VideoService dedupe):
 * upload-request → presigned POST (no auth) → complete → status polling. Uploaded ids are reused for
 * 14 days per source URL.
 */
class BasalamMedia
{
    public const TABLE = 'basalam_uploaded_media';

    public const TTL_DAYS = 14;

    public const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'jfif', 'avif'];

    public const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'];

    public const PHOTO_MAX = 5 * 1024 * 1024;

    public const VIDEO_MAX = 120 * 1024 * 1024;

    /** Delay between status polls; tests set it to 0. */
    public static int $pollDelayMs = 1000;

    public function __construct(protected BasalamClient $client) {}

    public static function for(int $tenantId): self
    {
        return new self(BasalamClient::for($tenantId));
    }

    protected function tid(): int
    {
        return $this->client->tenantId();
    }

    /** Basalam media id for a photo URL (cached upload reused). */
    public function photoId(string $url): ?int
    {
        return $this->mediaId('photo', $url);
    }

    public function videoId(string $url): ?int
    {
        return $this->mediaId('video', $url);
    }

    protected function mediaId(string $type, string $url): ?int
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }
        $identity = 'url:'.md5($url);
        $row = DB::table(self::TABLE)->where('tenant_id', $this->tid())->where('type', $type)->where('source_identity', $identity)->first();
        if ($row) {
            if (now()->diffInDays($row->created_at, true) < self::TTL_DAYS) {
                return (int) $row->media_id;
            }
            DB::table(self::TABLE)->where('id', $row->id)->delete();
        }
        $label = $type === 'video' ? 'video' : 'photo';
        try {
            $uploaded = $this->upload($url, $type);
        } catch (MarketplaceException $e) {
            throw new MarketplaceException("[{$label}] ".__('marketplace.basalam_media_upload_failed', ['error' => $e->getMessage()]), $e->status, $e->response, $e->retryAfter, $e->path);
        }
        DB::table(self::TABLE)->updateOrInsert(
            ['tenant_id' => $this->tid(), 'type' => $type, 'source_identity' => $identity],
            ['media_id' => (int) $uploaded['file_id'], 'media_url' => $uploaded['url'], 'created_at' => now(), 'updated_at' => now()]
        );

        return (int) $uploaded['file_id'];
    }

    /**
     * @return array{contents: string, filename: string, mime: string}
     */
    public function fetchSource(string $url, string $type): array
    {
        $path = (string) parse_url($url, PHP_URL_PATH);
        $filename = basename($path) ?: 'file';
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $allowed = $type === 'video' ? self::VIDEO_EXT : self::PHOTO_EXT;
        $max = $type === 'video' ? self::VIDEO_MAX : self::PHOTO_MAX;

        $contents = null;
        if (str_starts_with($path, '/storage/')) {
            $relative = substr($path, strlen('/storage/'));
            try {
                if (Storage::disk('public')->exists($relative)) {
                    $contents = Storage::disk('public')->get($relative);
                }
            } catch (Throwable) {
                $contents = null;
            }
        }
        if ($contents === null) {
            if (! preg_match('#^https?://#i', $url)) {
                throw new MarketplaceException(__('marketplace.basalam_media_unreachable'), 422);
            }
            try {
                $res = Http::timeout($type === 'video' ? 600 : 60)->withHeaders(['User-Agent' => 'Webino-Basalam'])->get($url);
            } catch (Throwable $e) {
                throw new MarketplaceException(__('marketplace.basalam_media_unreachable').' '.$e->getMessage(), 0);
            }
            if (! $res->successful()) {
                throw new MarketplaceException(__('marketplace.basalam_media_unreachable').' HTTP '.$res->status(), 422);
            }
            $contents = $res->body();
            if ($ext === '' || ! in_array($ext, $allowed, true)) {
                $ext = self::extFromMime((string) $res->header('Content-Type'));
                $filename = pathinfo($filename, PATHINFO_FILENAME).'.'.$ext;
            }
        }
        if (! in_array($ext, $allowed, true)) {
            throw new MarketplaceException(__('marketplace.basalam_media_bad_type', ['ext' => $ext ?: '?']), 422);
        }
        if (strlen($contents) === 0 || strlen($contents) > $max) {
            throw new MarketplaceException(__('marketplace.basalam_media_too_large', ['max' => (int) ($max / 1048576)]), 422);
        }

        return ['contents' => $contents, 'filename' => $filename, 'mime' => self::mimeFor($ext, $type)];
    }

    protected static function extFromMime(string $mime): string
    {
        $mime = strtolower(trim(explode(';', $mime)[0]));

        return match ($mime) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/bmp' => 'bmp',
            'image/avif' => 'avif',
            'video/mp4' => 'mp4',
            'video/quicktime' => 'mov',
            'video/webm' => 'webm',
            default => '',
        };
    }

    protected static function mimeFor(string $ext, string $type): string
    {
        return match ($ext) {
            'jpg', 'jpeg', 'jfif' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'bmp' => 'image/bmp',
            'avif' => 'image/avif',
            'mp4', 'm4v' => 'video/mp4',
            'mov' => 'video/quicktime',
            'webm' => 'video/webm',
            'mkv' => 'video/x-matroska',
            'avi' => 'video/x-msvideo',
            '3gp' => 'video/3gpp',
            default => $type === 'video' ? 'video/mp4' : 'application/octet-stream',
        };
    }

    /**
     * @return array{file_id: int|string, url: ?string, upload_file_id: string}
     */
    public function upload(string $url, string $type): array
    {
        $file = $this->fetchSource($url, $type);
        $fileType = $type === 'video' ? 'product.video' : 'product.photo';
        $request = $this->client->post(BasalamEndpoints::MEDIA_UPLOAD_REQUEST, [
            'file_name' => $file['filename'],
            'mime_type' => $file['mime'],
            'size' => strlen($file['contents']),
            'file_type' => $fileType,
            'checksum_sha256' => hash('sha256', $file['contents']),
            'upload_preference' => 'presigned_post',
            'multipart_part_size_bytes' => 0,
        ]);
        $fileId = $request['file_id'] ?? null;
        if (! $fileId || ($request['upload_strategy'] ?? '') !== 'presigned_post') {
            throw new MarketplaceException(__('marketplace.basalam_media_no_link').' [upload_request]', 502, $request);
        }
        $staging = (array) ($request['staging'] ?? []);
        $stagingUrl = (string) ($staging['url'] ?? '');
        $fields = (array) ($staging['fields'] ?? []);
        if ($stagingUrl === '' || $fields === []) {
            throw new MarketplaceException(__('marketplace.basalam_media_no_link').' [staging]', 502, $request);
        }
        $this->client->upload($stagingUrl, $file['contents'], $file['filename'], $fields, 'file', false, $type === 'video' ? 600 : 120);

        $complete = $this->client->post(BasalamEndpoints::MEDIA_UPLOAD_COMPLETE, ['file_id' => $fileId]);
        $media = self::normalizeCompleted($complete, (string) $fileId);
        if ($media === null) {
            $attempts = $type === 'video' ? 60 : 15;
            $statusUrl = sprintf(BasalamEndpoints::MEDIA_UPLOAD_STATUS, rawurlencode((string) $fileId));
            for ($i = 0; $i < $attempts && $media === null; $i++) {
                $status = $this->client->get($statusUrl);
                $media = self::normalizeCompleted($status, (string) $fileId);
                if ($media === null && $i < $attempts - 1 && self::$pollDelayMs > 0) {
                    usleep(self::$pollDelayMs * 1000);
                }
            }
        }
        if ($media === null) {
            throw new MarketplaceException(__('marketplace.basalam_media_no_id').' [status]', 502);
        }

        return $media;
    }

    /** @param  array<mixed>  $body */
    public static function normalizeCompleted(array $body, string $requestFileId): ?array
    {
        $data = is_array($body['data'] ?? null) ? $body['data'] : $body;
        $ready = $data['ready'] ?? null;
        $status = is_string($data['status'] ?? null) ? strtolower($data['status']) : null;
        if (is_array($data['media'] ?? null)) {
            $data = $data['media'];
        }
        if (is_array($data['file'] ?? null)) {
            $data = $data['file'];
        }
        if (is_string($data['status'] ?? null)) {
            $status = strtolower($data['status']);
        }
        if (array_key_exists('ready', $data)) {
            $ready = $data['ready'];
        }
        if (in_array($status, ['failed', 'aborted'], true)) {
            throw new MarketplaceException(__('marketplace.basalam_media_processing_failed'), 422);
        }
        if ($ready === false || in_array($status, ['initiated', 'uploading', 'processing', 'queued'], true)) {
            return null;
        }
        $mediaId = $data['id'] ?? $data['media_id'] ?? null;
        if ($mediaId === null || $mediaId === '') {
            return null;
        }
        $url = data_get($data, 'urls.primary') ?? $data['url'] ?? $data['media_url'] ?? null;

        return ['file_id' => $mediaId, 'url' => is_string($url) ? $url : null, 'upload_file_id' => $requestFileId];
    }
}
