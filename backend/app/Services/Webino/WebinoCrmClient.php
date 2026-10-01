<?php

namespace App\Services\Webino;

use Illuminate\Support\Facades\Http;

/** CRM account notes from ERP /api/v1/crm/accounts/{id}/notes */
class WebinoCrmClient
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
     * @return array{ok: bool, status: int, data: mixed, message?: string}
     */
    protected function call(string $method, string $path, array $body = []): array
    {
        if (! $this->isConfigured()) {
            return ['ok' => false, 'status' => 503, 'data' => null, 'message' => 'WEBINO_ERP_API_TOKEN not configured'];
        }
        $url = $this->baseUrl().'/'.ltrim($path, '/');
        try {
            $req = Http::timeout(20)->acceptJson()->withToken($this->token());
            $res = match (strtoupper($method)) {
                'GET' => $req->get($url),
                'POST' => $req->asJson()->post($url, $body),
                'DELETE' => $req->delete($url),
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

    public function listNotes(int $accountId): array
    {
        return $this->call('GET', '/api/v1/crm/accounts/'.$accountId.'/notes');
    }

    public function storeNote(int $accountId, string $body, ?string $subject = null): array
    {
        return $this->call('POST', '/api/v1/crm/accounts/'.$accountId.'/notes', [
            'body' => $body,
            'subject' => $subject,
        ]);
    }

    public function destroyNote(int $accountId, int $noteId): array
    {
        return $this->call('DELETE', '/api/v1/crm/accounts/'.$accountId.'/notes/'.$noteId);
    }
}
