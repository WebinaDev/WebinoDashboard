<?php

namespace App\Services\ProductCatalog;

use App\Services\WordpressImport\ImportUrlGuard;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;

/**
 * Polite JSON/HTML fetch for external catalog sources (cache + per-tenant rate limit).
 * Hosts must be allow-listed; DNS is checked against private/blocked ranges.
 */
final class ExternalCatalogHttp
{
    public const CACHE_TTL = 600;

    public const RATE_PER_MINUTE = 40;

    /** @var null|callable(string): list<string> */
    public mixed $resolver = null;

    /**
     * @param  list<string>  $allowedHosts
     * @return array<string, mixed>
     */
    public function getJson(int $tenantId, string $url, array $allowedHosts, int $cacheTtl = self::CACHE_TTL): array
    {
        $this->assertRate($tenantId);
        $cacheKey = 'extcat:json:'.$tenantId.':'.hash('sha256', $url);
        if ($cacheTtl > 0) {
            $cached = Cache::get($cacheKey);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $response = $this->guardedGet($url, $allowedHosts, true);
        if ($response->status() === 429) {
            throw new RuntimeException(__('External catalog rate limit reached. Try again later.'));
        }
        if (! $response->successful() || ! is_array($response->json())) {
            throw new RuntimeException(__('Catalog provider returned HTTP :status.', ['status' => $response->status()]));
        }
        $data = $response->json();
        if ($cacheTtl > 0) {
            Cache::put($cacheKey, $data, $cacheTtl);
        }

        return $data;
    }

    /**
     * @param  list<string>  $allowedHosts
     */
    public function getBody(int $tenantId, string $url, array $allowedHosts, int $cacheTtl = self::CACHE_TTL): string
    {
        $this->assertRate($tenantId);
        $cacheKey = 'extcat:body:'.$tenantId.':'.hash('sha256', $url);
        if ($cacheTtl > 0) {
            $cached = Cache::get($cacheKey);
            if (is_string($cached)) {
                return $cached;
            }
        }

        $response = $this->guardedGet($url, $allowedHosts, false);
        if ($response->status() === 429) {
            throw new RuntimeException(__('External catalog rate limit reached. Try again later.'));
        }
        if (! $response->successful()) {
            throw new RuntimeException(__('Catalog provider returned HTTP :status.', ['status' => $response->status()]));
        }
        $body = $response->body();
        if ($cacheTtl > 0) {
            Cache::put($cacheKey, $body, $cacheTtl);
        }

        return $body;
    }

    protected function assertRate(int $tenantId): void
    {
        $key = 'extcat:rl:'.$tenantId;
        if (RateLimiter::tooManyAttempts($key, self::RATE_PER_MINUTE)) {
            throw new RuntimeException(__('Too many catalog requests. Wait a moment and try again.'));
        }
        RateLimiter::hit($key, 60);
    }

    /**
     * @param  list<string>  $allowedHosts
     */
    protected function guardedGet(string $url, array $allowedHosts, bool $json): \Illuminate\Http\Client\Response
    {
        $current = $url;
        for ($hop = 0; $hop < 3; $hop++) {
            $parts = $this->guardUrl($current, $allowedHosts);
            try {
                $response = Http::withOptions([
                    'allow_redirects' => false,
                    'timeout' => 18,
                    'connect_timeout' => 5,
                ])->withHeaders([
                    'User-Agent' => 'WebinoDashboard/1.0 (external-product-catalog)',
                    'Accept' => $json ? 'application/json' : 'text/html,application/json;q=0.8',
                ])->get($current);
            } catch (ConnectionException $e) {
                throw new RuntimeException(__('Catalog provider unreachable: :message', ['message' => $e->getMessage()]));
            }

            $status = $response->status();
            if (in_array($status, [301, 302, 303, 307, 308], true)) {
                $location = (string) $response->header('Location');
                if ($location === '') {
                    throw new RuntimeException(__('Catalog provider returned HTTP :status.', ['status' => $status]));
                }
                $current = $this->resolveRedirect($current, $location);

                continue;
            }

            return $response;
        }

        throw new RuntimeException(__('Catalog provider returned HTTP :status.', ['status' => 310]));
    }

    /**
     * @param  list<string>  $allowedHosts
     * @return array{scheme: string, host: string, port: int, path: string}
     */
    protected function guardUrl(string $url, array $allowedHosts): array
    {
        try {
            $parts = ImportUrlGuard::parseHttp($url);
        } catch (\InvalidArgumentException $e) {
            throw new RuntimeException($e->getMessage());
        }
        $host = strtolower($parts['host']);
        $ok = false;
        foreach ($allowedHosts as $candidate) {
            $candidate = strtolower(ltrim(trim($candidate), '.'));
            if ($candidate !== '' && ($host === $candidate || str_ends_with($host, '.'.$candidate))) {
                $ok = true;
                break;
            }
        }
        if (! $ok) {
            throw new RuntimeException(__('That host is not allowed.'));
        }
        $ips = $this->resolveIps($parts['host']);
        if ($ips === []) {
            throw new RuntimeException(__('That host is not allowed.'));
        }
        foreach ($ips as $ip) {
            if (! is_string($ip) || ImportUrlGuard::isBlockedIp($ip)) {
                throw new RuntimeException(__('That host is not allowed.'));
            }
        }

        return $parts;
    }

    /** @return list<string> */
    protected function resolveIps(string $host): array
    {
        if ($this->resolver !== null) {
            $ips = ($this->resolver)($host);

            return is_array($ips) ? array_values(array_filter($ips, 'is_string')) : [];
        }
        if (app()->runningUnitTests()) {
            return ['1.1.1.1'];
        }
        $ips = [];
        $v4 = @gethostbynamel($host);
        if (is_array($v4)) {
            foreach ($v4 as $ip) {
                if (is_string($ip)) {
                    $ips[] = $ip;
                }
            }
        }

        return $ips;
    }

    protected function resolveRedirect(string $from, string $location): string
    {
        if (preg_match('#^https?://#i', $location)) {
            return $location;
        }
        $base = parse_url($from);
        $scheme = $base['scheme'] ?? 'https';
        $host = $base['host'] ?? '';
        if (str_starts_with($location, '//')) {
            return $scheme.':'.$location;
        }
        if (str_starts_with($location, '/')) {
            return $scheme.'://'.$host.$location;
        }

        return $scheme.'://'.$host.'/'.ltrim($location, '/');
    }
}
