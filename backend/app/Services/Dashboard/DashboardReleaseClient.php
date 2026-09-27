<?php

namespace App\Services\Dashboard;

use Illuminate\Support\Facades\Http;
use Throwable;

class DashboardReleaseClient
{
    protected function baseUrl(): string
    {
        return rtrim((string) config('services.webino.base_url'), '/');
    }

    /**
     * @return array<string, mixed>
     */
    public function check(string $currentVersion): array
    {
        $url = $this->baseUrl().'/api/v1/dashboard/releases/check';

        $response = Http::timeout(20)
            ->acceptJson()
            ->get($url, ['current_version' => $currentVersion]);

        if (! $response->successful()) {
            throw new \RuntimeException('Release check failed: HTTP '.$response->status());
        }

        $json = $response->json();
        $data = is_array($json) ? ($json['data'] ?? $json) : null;
        if (! is_array($data)) {
            throw new \RuntimeException('Release check returned invalid payload');
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    public function downloadGrant(?string $version = null): array
    {
        $url = $this->baseUrl().'/api/v1/dashboard/releases/download';

        $payload = array_filter(['version' => $version]);
        $response = Http::timeout(30)->acceptJson()->post($url, $payload);

        if (! $response->successful()) {
            throw new \RuntimeException('Release download grant failed: HTTP '.$response->status());
        }

        $json = $response->json();
        $data = is_array($json) ? ($json['data'] ?? $json) : null;
        if (! is_array($data)) {
            throw new \RuntimeException('Release download grant returned invalid payload');
        }

        return $data;
    }

    public function downloadTo(string $downloadUrl, string $destPath): void
    {
        try {
            $response = Http::timeout(600)->sink($destPath)->get($downloadUrl);
            if (! $response->successful()) {
                throw new \RuntimeException('Download failed: HTTP '.$response->status());
            }
        } catch (Throwable $e) {
            if (is_file($destPath)) {
                @unlink($destPath);
            }
            throw $e;
        }
    }
}
