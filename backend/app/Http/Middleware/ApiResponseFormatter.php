<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiResponseFormatter
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (str_ends_with($request->path(), 'openapi.json')) {
            return $next($request);
        }

        // CRM ModirPayamak proxy returns { ok, account?, data?, ... } — do not re-envelope.
        if (str_contains($request->path(), 'modirpayamak')) {
            return $next($request);
        }

        $response = $next($request);

        if ($response->isEmpty() || $response->getStatusCode() === 204) {
            return $response;
        }

        if (! $this->shouldFormat($request, $response)) {
            return $response;
        }

        $content = json_decode($response->getContent(), true);

        if (! is_array($content)) {
            return $response;
        }

        if ($this->isEnvelope($content)) {
            return $response;
        }

        $status = $response->getStatusCode();
        $success = $status >= 200 && $status < 300;

        $formatted = $success
            ? $this->formatSuccess($content)
            : $this->formatError($content, $status);

        $json = response()->json($formatted, $status);
        foreach ($response->headers->getCookies() as $cookie) {
            $json->headers->setCookie($cookie);
        }

        return $json;
    }

    private function shouldFormat(Request $request, Response $response): bool
    {
        if ($response->headers->get('Content-Type') === 'application/json') {
            return true;
        }

        return $request->wantsJson() || str_starts_with($request->path(), 'api/');
    }

    /**
     * @param  array<string, mixed>  $content
     */
    private function isEnvelope(array $content): bool
    {
        return array_key_exists('success', $content)
            && (array_key_exists('data', $content) || array_key_exists('errors', $content));
    }

    /**
     * @param  array<string, mixed>  $content
     * @return array<string, mixed>
     */
    private function formatSuccess(array $content): array
    {
        $message = null;
        $meta = null;
        $data = $content;

        if (isset($content['message']) && is_string($content['message'])) {
            $message = $content['message'];
            unset($data['message']);
        }

        if (isset($content['meta']) && is_array($content['meta'])) {
            $meta = $content['meta'];
            unset($data['meta']);
        }

        if (isset($content['data'])) {
            $data = $content['data'];
        }

        return [
            'success' => true,
            'data' => $data,
            'message' => $message,
            'meta' => $meta,
            'errors' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $content
     * @return array<string, mixed>
     */
    private function formatError(array $content, int $status): array
    {
        $message = is_string($content['message'] ?? null) ? $content['message'] : null;
        $errors = isset($content['errors']) && is_array($content['errors']) ? $content['errors'] : null;
        $data = array_key_exists('data', $content) ? $content['data'] : null;

        if ($message === null && is_array($data) && isset($data['status']) && is_string($data['status'])) {
            $message = 'status.'.$data['status'];
        }

        if ($message === null) {
            $message = match ($status) {
                401 => 'auth.unauthorized',
                403 => 'auth.forbidden',
                404 => 'errors.not_found',
                422 => 'validation.failed',
                503 => 'errors.unavailable',
                default => 'errors.server',
            };
        }

        return [
            'success' => false,
            'data' => $data,
            'message' => $message,
            'meta' => null,
            'errors' => $errors,
        ];
    }
}
