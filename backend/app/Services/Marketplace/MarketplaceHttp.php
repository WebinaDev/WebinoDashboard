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
     * @param  array{headers?: array<string, string>, body?: mixed, query?: array<string, mixed>, form?: bool, multipart?: list<array<string, mixed>>, timeout?: int, raw?: bool, http11?: bool}  $opts
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
        try {
            return self::dispatch($method, $url, $opts);
        } catch (ConnectionException $e) {
            if (self::isTruncatedTransfer($e->getMessage()) && empty($opts['_retried'])) {
                return self::dispatch($method, $url, array_merge($opts, ['_retried' => true, 'http11' => true]));
            }
            throw new MarketplaceException($e->getMessage(), 0, [], 0, parse_url($url, PHP_URL_PATH) ?: $url);
        }
    }

    /**
     * Force HTTP/1.1 for Basalam accounting (and optionally other hosts) — HTTP/2 mid-body drops show up as cURL 18.
     *
     * @param  array<string, mixed>  $opts
     *
     * @throws ConnectionException
     */
    protected static function dispatch(string $method, string $url, array $opts = []): Response
    {
        $method = strtoupper($method);
        $headers = $opts['headers'] ?? [];
        $forceHttp11 = ! empty($opts['http11']) || self::needsHttp11($url);
        $pending = Http::timeout((int) ($opts['timeout'] ?? 35))->withHeaders($headers);
        if ($forceHttp11 && defined('CURL_HTTP_VERSION_1_1')) {
            $pending = $pending->withOptions([
                'curl' => [CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1],
                'version' => 1.1,
            ]);
        }

        if (! empty($opts['query'])) {
            $url .= (str_contains($url, '?') ? '&' : '?').http_build_query($opts['query']);
        }

        $body = $opts['body'] ?? null;
        if (! empty($opts['multipart'])) {
            foreach ($opts['multipart'] as $part) {
                $pending = $pending->attach($part['name'], $part['contents'], $part['filename'] ?? null);
            }

            return $pending->send($method, $url);
        }
        if (! empty($opts['form'])) {
            return $pending->asForm()->send($method, $url, ['form_params' => is_array($body) ? $body : []]);
        }
        if ($body === null) {
            return $pending->acceptJson()->send($method, $url);
        }
        if (is_string($body)) {
            return $pending->withBody($body, $headers['Content-Type'] ?? 'application/json')->send($method, $url);
        }

        return $pending->asJson()->acceptJson()->send($method, $url, ['json' => $body]);
    }

    public static function needsHttp11(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return str_contains($host, 'accounting.basalam.com')
            || str_contains($host, 'webina.dev')
            || str_contains($host, 'webinaagency.ir');
    }

    public static function isTruncatedTransfer(string $message): bool
    {
        return str_contains($message, 'cURL error 18')
            || str_contains($message, 'cURL error 52')
            || str_contains($message, 'cURL error 56')
            || str_contains($message, 'transfer closed')
            || str_contains($message, 'Connection reset');
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
