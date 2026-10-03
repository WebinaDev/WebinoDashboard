<?php

namespace App\Services\WordpressImport;

use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

/**
 * Downloads a single allowlisted media URL. DNS answers are checked for
 * private ranges and the connection is pinned to that address.
 */
final class SafeRemoteFetcher implements RemoteAssetFetcher
{
    /** @param  null|callable(string): list<string>  $resolver */
    public function __construct(private readonly mixed $resolver = null) {}

    public function fetch(string $url, array $allowedHosts, int $maxBytes = 8388608, string $kind = 'image'): FetchedAsset
    {
        if (! defined('CURLOPT_RESOLVE')) {
            throw new RuntimeException('Remote media download requires the curl extension.');
        }

        $current = $url;
        for ($hop = 0; $hop < 3; $hop++) {
            $parts = ImportUrlGuard::parseHttp($current);
            if (! ImportUrlGuard::hostAllowed($parts['host'], $allowedHosts)) {
                throw new InvalidArgumentException('Media host is not on the allowlist.');
            }
            $ip = $this->publicIp($parts['host']);
            $curl = [
                CURLOPT_RESOLVE => [$parts['host'].':'.$parts['port'].':'.$ip],
            ];
            if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
                $curl[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
            }
            if (defined('CURLOPT_MAXFILESIZE')) {
                $curl[CURLOPT_MAXFILESIZE] = $maxBytes;
            }
            $response = Http::withOptions([
                'allow_redirects' => false,
                'timeout' => 12,
                'connect_timeout' => 5,
                'curl' => $curl,
            ])->withHeaders([
                'User-Agent' => 'WebinoImport/1.0',
                'Accept' => 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1',
            ])->get($current);

            $status = $response->status();
            if (in_array($status, [301, 302, 303, 307, 308], true)) {
                $location = (string) $response->header('Location');
                if ($location === '') {
                    throw new RuntimeException('Media redirect was empty.');
                }
                $current = $this->resolveRedirect($current, $location);

                continue;
            }
            if (! $response->successful()) {
                throw new RuntimeException('Media download failed with HTTP '.$status.'.');
            }
            $body = $response->body();
            if ($body === '' || strlen($body) > $maxBytes) {
                throw new RuntimeException('Media file is empty or too large.');
            }
            $mime = $this->imageMime($body, $kind);
            $filename = $this->filename($parts['path'], $mime);

            return new FetchedAsset($body, $mime, $filename);
        }

        throw new RuntimeException('Too many media redirects.');
    }

    private function publicIp(string $host): string
    {
        $ips = $this->resolver !== null
            ? ($this->resolver)($host)
            : $this->lookup($host);
        if (! is_array($ips) || $ips === []) {
            throw new RuntimeException('Media host did not resolve.');
        }
        foreach ($ips as $ip) {
            if (! is_string($ip) || ImportUrlGuard::isBlockedIp($ip)) {
                throw new RuntimeException('Media host resolved to a blocked address.');
            }
        }
        foreach ($ips as $ip) {
            if (is_string($ip) && ! str_contains($ip, ':')) {
                return $ip;
            }
        }

        return (string) $ips[0];
    }

    /** @return list<string> */
    private function lookup(string $host): array
    {
        $ips = [];
        if (function_exists('dns_get_record')) {
            $records = @dns_get_record($host, DNS_A + DNS_AAAA);
            if (is_array($records)) {
                foreach ($records as $row) {
                    if (! empty($row['ip'])) {
                        $ips[] = (string) $row['ip'];
                    }
                    if (! empty($row['ipv6'])) {
                        $ips[] = (string) $row['ipv6'];
                    }
                }
            }
        }
        if ($ips === []) {
            $v4 = @gethostbynamel($host);
            if (is_array($v4)) {
                $ips = $v4;
            }
        }

        return array_values(array_unique($ips));
    }

    private function resolveRedirect(string $current, string $location): string
    {
        if (str_starts_with($location, 'http://') || str_starts_with($location, 'https://')) {
            return $location;
        }
        $parts = parse_url($current);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new RuntimeException('Media redirect could not be resolved.');
        }
        $origin = $parts['scheme'].'://'.$parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':'.$parts['port'];
        }
        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }
        $path = (string) ($parts['path'] ?? '/');
        $dir = rtrim(str_replace('\\', '/', dirname($path)), '/');

        return $origin.$dir.'/'.$location;
    }

    private function imageMime(string $body, string $kind = 'image'): string
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($body) ?: '';
        $images = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        $files = ['image/svg+xml', 'application/pdf', 'video/mp4', 'video/webm'];
        $allowed = $kind === 'file' ? array_merge($images, $files) : $images;
        if (! in_array($mime, $allowed, true)) {
            throw new RuntimeException($kind === 'file'
                ? 'File must be an image, SVG, PDF, or MP4/WebM video.'
                : 'Only JPEG, PNG, GIF, and WebP images can be downloaded.');
        }
        if ($mime === 'image/svg+xml') {
            return $mime;
        }

        return $mime;
    }

    private function filename(string $path, string $mime): string
    {
        $base = basename($path);
        $base = preg_replace('/[^A-Za-z0-9._-]+/', '-', $base) ?? 'image';
        $base = trim((string) $base, '-.');
        if ($base === '' || ! str_contains($base, '.')) {
            $ext = match ($mime) {
                'image/png' => 'png',
                'image/gif' => 'gif',
                'image/webp' => 'webp',
                default => 'jpg',
            };
            $base = ($base !== '' ? $base : 'image').'.'.$ext;
        }

        return mb_substr($base, 0, 120);
    }
}
