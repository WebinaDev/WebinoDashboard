<?php

namespace App\Services\Marketplace\Basalam;

use App\Services\Marketplace\MarketplaceException;
use App\Services\Marketplace\MarketplaceHttp;
use App\Services\Marketplace\MarketplaceLogger;
use App\Services\Marketplace\MarketplaceSettingsService;
use Illuminate\Http\Client\Response;

/**
 * Basalam HTTP client (port of ApiServiceManager + ApiResponseHandler): bearer auth with one
 * refresh-and-retry on 401, circuit breaker on transient failures, and request logging.
 */
class BasalamClient
{
    protected BasalamCircuitBreaker $breaker;

    protected ?BasalamAuth $auth = null;

    public int $lastStatus = 0;

    public function __construct(
        protected int $tenantId,
        protected MarketplaceSettingsService $settings,
    ) {
        $this->breaker = new BasalamCircuitBreaker($tenantId);
    }

    public static function for(int $tenantId): self
    {
        return new self($tenantId, app(MarketplaceSettingsService::class));
    }

    public function tenantId(): int
    {
        return $this->tenantId;
    }

    public function auth(): BasalamAuth
    {
        return $this->auth ??= new BasalamAuth($this->tenantId, $this->settings);
    }

    public function breaker(): BasalamCircuitBreaker
    {
        return $this->breaker;
    }

    /** Connected booth id; resolves it from /users/me when only a token is stored. */
    public function vendorId(): int
    {
        return $this->auth()->ensureVendorId();
    }

    /** @param  array<string, mixed>  $query */
    public function get(string $url, array $query = [], array $opts = []): array
    {
        return $this->request('GET', $url, null, $opts + ['query' => $query]);
    }

    public function post(string $url, mixed $body = [], array $opts = []): array
    {
        return $this->request('POST', $url, $body, $opts);
    }

    public function patch(string $url, mixed $body = [], array $opts = []): array
    {
        return $this->request('PATCH', $url, $body, $opts);
    }

    public function put(string $url, mixed $body = [], array $opts = []): array
    {
        return $this->request('PUT', $url, $body, $opts);
    }

    public function delete(string $url, mixed $body = null, array $opts = []): array
    {
        return $this->request('DELETE', $url, $body, $opts);
    }

    /**
     * @param  array{query?: array<string, mixed>, auth?: bool, retried?: bool, timeout?: int, multipart?: list<array<string, mixed>>, headers?: array<string, string>}  $opts
     * @return array<mixed> Decoded JSON body (lists stay lists)
     *
     * @throws MarketplaceException
     */
    public function request(string $method, string $url, mixed $body = null, array $opts = []): array
    {
        $basalam = BasalamEndpoints::isBasalamHost($url);
        if ($basalam) {
            $this->breaker->assertAllowed();
        }

        $headers = array_merge([
            'Accept' => 'application/json',
            'User-Agent' => 'Webino-Basalam',
            'Referer' => BasalamAuth::siteUrl($this->tenantId),
        ], $opts['headers'] ?? []);
        if (($opts['auth'] ?? true) === true) {
            $token = $this->auth()->accessToken();
            if ($token === '') {
                throw new MarketplaceException(__('marketplace.basalam_not_connected'), 401);
            }
            $headers['Authorization'] = 'Bearer '.$token;
        }

        $started = microtime(true);
        $sendOpts = ['headers' => $headers, 'timeout' => $opts['timeout'] ?? 30, 'query' => $opts['query'] ?? []];
        if (! empty($opts['multipart'])) {
            $sendOpts['multipart'] = $opts['multipart'];
        } elseif ($body !== null && ! ($method === 'GET')) {
            $sendOpts['body'] = $body;
        }

        try {
            $response = MarketplaceHttp::send($method, $url, $sendOpts);
        } catch (MarketplaceException $e) {
            $this->lastStatus = 0;
            BasalamRequestLog::record($this->tenantId, $url, 0, false, $this->elapsed($started), $e->getMessage());
            if ($basalam) {
                $this->breaker->recordFailure();
            }
            throw new MarketplaceException(__('marketplace.basalam_network_error', ['error' => $e->getMessage()]), 0, [], 0, $e->path);
        }

        $status = $response->status();
        $this->lastStatus = $status;
        $decoded = $this->decode($response);
        $ok = $status >= 200 && $status < 300;
        BasalamRequestLog::record($this->tenantId, $url, $status, $ok, $this->elapsed($started), $ok ? null : $this->errorMessage($decoded, $status));

        if ($ok) {
            if ($basalam) {
                $this->breaker->recordSuccess();
            }
            if ($status >= 200 && ($opts['auth'] ?? true)) {
                $this->auth()->clearAuthError();
            }

            return $decoded;
        }

        if ($status === 401 && ($opts['auth'] ?? true) && $basalam) {
            if (! ($opts['retried'] ?? false) && $this->auth()->refreshToken() !== '') {
                try {
                    $this->auth()->refresh();

                    return $this->request($method, $url, $body, array_merge($opts, ['retried' => true]));
                } catch (MarketplaceException) {
                }
            }
            $this->auth()->markAuthError($this->errorMessage($decoded, 401));
        }

        $transient = $status === 429 || $status === 408 || $status >= 500;
        if ($transient && $basalam) {
            $this->breaker->recordFailure();
        }

        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        $message = $this->errorMessage($decoded, $status);
        if ($status === 404 && preg_match('#/v1/vendors/\d+/products/?$#', $path) && $message === '') {
            $message = __('marketplace.basalam_vendor_not_found');
        }
        MarketplaceLogger::warning($this->tenantId, 'basalam', 'api', sprintf('%s %s → %d %s', $method, $path, $status, $message));

        throw new MarketplaceException(
            sprintf('%s [HTTP %d %s]', $message ?: __('marketplace.basalam_http_error'), $status, $path),
            $status,
            is_array($decoded) ? $decoded : [],
            (int) $response->header('Retry-After'),
            $path,
        );
    }

    /**
     * Multipart upload. Fields precede the file, as presigned POST targets require; presigned
     * staging URLs are called without the bearer token.
     *
     * @param  array<string, scalar>  $fields
     * @return array<mixed>
     */
    public function upload(string $url, string $contents, string $filename, array $fields = [], string $fileField = 'file', bool $auth = true, int $timeout = 120): array
    {
        $multipart = [];
        foreach ($fields as $name => $value) {
            $multipart[] = ['name' => (string) $name, 'contents' => (string) $value];
        }
        $multipart[] = ['name' => $fileField, 'contents' => $contents, 'filename' => $filename];

        return $this->request('POST', $url, null, ['multipart' => $multipart, 'timeout' => $timeout, 'auth' => $auth]);
    }

    /** @return array<mixed> */
    protected function decode(Response $response): array
    {
        $json = $response->json();
        if (is_array($json)) {
            return $json;
        }
        $raw = trim($response->body());

        return $raw === '' ? [] : ['raw' => mb_substr($raw, 0, 2000)];
    }

    /** @param  array<mixed>  $body */
    public function errorMessage(array $body, int $status = 0): string
    {
        $candidates = [
            data_get($body, 'errors.0.message'),
            data_get($body, 'messages.0.message'),
            data_get($body, 'message'),
            data_get($body, 'error_description'),
            data_get($body, 'detail'),
            data_get($body, 'error'),
        ];
        foreach ($candidates as $c) {
            if (is_string($c) && trim($c) !== '') {
                return trim($c);
            }
        }
        if (isset($body['errors']) && is_array($body['errors'])) {
            foreach ($body['errors'] as $field => $messages) {
                $first = is_array($messages) ? reset($messages) : $messages;
                if (is_string($first) && $first !== '') {
                    return is_string($field) ? $field.': '.$first : $first;
                }
            }
        }

        return match ($status) {
            400 => 'درخواست نامعتبر',
            401 => 'احراز هویت باسلام نامعتبر است',
            403 => 'دسترسی غیرمجاز',
            404 => 'منبع مورد نظر یافت نشد',
            422 => 'خطا در پردازش داده‌ها',
            429 => 'محدودیت تعداد درخواست باسلام',
            default => '',
        };
    }

    protected function elapsed(float $started): int
    {
        return (int) round((microtime(true) - $started) * 1000);
    }
}
