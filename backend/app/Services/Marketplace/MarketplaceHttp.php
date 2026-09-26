<?php

namespace App\Services\Marketplace;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Shared HTTP transport for marketplace adapters (JSON / form / multipart), mirroring WNC_HTTP.
 */
class MarketplaceHttp
{
    /**
     * @param  array{headers?: array<string, string>, body?: mixed, query?: array<string, mixed>, form?: bool, multipart?: list<array<string, mixed>>, timeout?: int, raw?: bool}  $opts
     * @return array<string, mixed> Decoded body with `_status`
     *
     * @throws MarketplaceException
     */
    public static function request(string $method, string $url, array $opts = []): array
    {
        $response = self::send($method, $url, $opts);

        return self::decode($response, $url);
    }

    /**
     * @param  array<string, mixed>  $opts
     *
     * @throws MarketplaceException
     */
    public static function send(string $method, string $url, array $opts = []): Response
    {
        $method = strtoupper($method);
        $headers = $opts['headers'] ?? [];
        $pending = Http::timeout((int) ($opts['timeout'] ?? 35))->withHeaders($headers);

        if (! empty($opts['query'])) {
            $url .= (str_contains($url, '?') ? '&' : '?').http_build_query($opts['query']);
        }

        $body = $opts['body'] ?? null;
        try {
            if (! empty($opts['multipart'])) {
                foreach ($opts['multipart'] as $part) {
                    $pending = $pending->attach($part['name'], $part['contents'], $part['filename'] ?? null);
                }
                $response = $pending->send($method, $url);
            } elseif (! empty($opts['form'])) {
                $response = $pending->asForm()->send($method, $url, ['form_params' => is_array($body) ? $body : []]);
            } elseif ($body === null) {
                $response = $pending->acceptJson()->send($method, $url);
            } elseif (is_string($body)) {
                $response = $pending->withBody($body, $headers['Content-Type'] ?? 'application/json')->send($method, $url);
            } else {
                $response = $pending->asJson()->acceptJson()->send($method, $url, ['json' => $body]);
            }
        } catch (ConnectionException $e) {
            throw new MarketplaceException($e->getMessage(), 0, [], 0, parse_url($url, PHP_URL_PATH) ?: $url);
        }

        return $response;
    }

    /**
     * @return array<string, mixed>
     *
     * @throws MarketplaceException
     */
    public static function decode(Response $response, string $url): array
    {
        $status = $response->status();
        $json = $response->json();
        $body = is_array($json) ? $json : ['raw' => $response->body()];
        $body['_status'] = $status;

        if ($status < 200 || $status >= 300) {
            $path = parse_url($url, PHP_URL_PATH) ?: $url;
            throw new MarketplaceException(
                sprintf('%s [%d %s]', self::errorMessage($body), $status, $path),
                $status,
                $body,
                (int) $response->header('Retry-After'),
                $path,
            );
        }

        return $body;
    }

    /** @param  array<string, mixed>  $body */
    public static function errorMessage(array $body): string
    {
        foreach (['message', 'error_description', 'detail', 'error', 'title'] as $key) {
            $v = $body[$key] ?? null;
            if (is_string($v) && $v !== '') {
                return $v;
            }
            if (is_array($v) && isset($v['message']) && is_string($v['message'])) {
                return $v['message'];
            }
        }
        if (isset($body['messages']) && is_array($body['messages'])) {
            $first = reset($body['messages']);
            if (is_string($first)) {
                return $first;
            }
        }

        return 'API error';
    }

    public static function join(string $base, string $path): string
    {
        return rtrim($base, '/').'/'.ltrim($path, '/');
    }
}
