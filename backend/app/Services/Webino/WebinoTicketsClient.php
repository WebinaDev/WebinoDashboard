<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/**
 * Sync Dashboard support tickets with ERP /api/v1/projects/tickets.
 * Uses sanctum-style bearer from WEBINO_ERP_API_TOKEN when configured.
 */
class WebinoTicketsClient
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    public function token(): string
    {
        return (string) config('services.webino.erp_api_token', env('WEBINO_ERP_API_TOKEN', ''));
    }

    public function isConfigured(): bool
    {
        return $this->baseUrl() !== '' && $this->token() !== '';
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    public function request(string $method, string $path, array $query = [], array $body = []): array
    {
        if (! $this->isConfigured()) {
            return ['ok' => false, 'status' => 503, 'data' => null, 'message' => 'WEBINO_ERP_API_TOKEN not configured'];
        }
        $url = $this->baseUrl().'/'.ltrim($path, '/');
        try {
            $req = Http::timeout(25)->acceptJson()->withToken($this->token());
            $res = match (strtoupper($method)) {
                'GET' => $req->get($url, $query),
                'POST' => $req->asJson()->post($url, $body),
                'PATCH' => $req->asJson()->patch($url, $body),
                'PUT' => $req->asJson()->put($url, $body),
                default => $req->send($method, $url, ['json' => $body]),
            };
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 502, 'data' => null, 'message' => $e->getMessage()];
        }

        return [
            'ok' => $res->successful(),
            'status' => $res->status(),
            'data' => $res->json(),
            'message' => $res->successful() ? null : (string) data_get($res->json(), 'message', $res->body()),
        ];
    }

    public function create(array $payload): array
    {
        return $this->request('POST', '/api/v1/projects/tickets', [], $payload);
    }

    public function update(int $erpId, array $payload): array
    {
        return $this->request('PATCH', '/api/v1/projects/tickets/'.$erpId, [], $payload);
    }

    public function assign(int $erpId, ?int $assigneeId): array
    {
        return $this->update($erpId, ['assignee_id' => $assigneeId]);
    }

    public function convertTask(int $erpId): array
    {
        return $this->request('POST', '/api/v1/projects/tickets/'.$erpId.'/convert-task');
    }

    public function rating(int $erpId, int $rating): array
    {
        return $this->request('POST', '/api/v1/projects/tickets/'.$erpId.'/rating', [], ['rating' => $rating]);
    }
}
