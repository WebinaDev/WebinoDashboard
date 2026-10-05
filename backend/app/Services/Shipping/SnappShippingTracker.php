<?php

namespace App\Services\Shipping;

use Illuminate\Support\Facades\Http;

class SnappShippingTracker
{
    /**
     * @param  array<string, mixed>  $settings
     * @return array{carrier: string, status: string|null, events: list<array<string, mixed>>, tracking_url: string|null}
     */
    public function track(int $tenantId, string $trackingCode, array $settings): array
    {
        $token = (string) ($settings['api_token'] ?? '');
        $base = rtrim((string) ($settings['api_base'] ?? 'https://api.snapp.box'), '/');
        if ($token === '') {
            return [
                'carrier' => 'snapp',
                'status' => 'unconfigured',
                'events' => [],
                'tracking_url' => null,
            ];
        }

        try {
            $response = Http::timeout(20)
                ->withToken($token)
                ->acceptJson()
                ->get($base.'/v1/shipments/'.urlencode($trackingCode));
            if (! $response->successful()) {
                throw new \RuntimeException('Snapp track failed');
            }
            $json = $response->json();
            $events = [];
            foreach ((array) data_get($json, 'events', []) as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $events[] = [
                    'at' => data_get($row, 'at') ?? data_get($row, 'timestamp'),
                    'label' => data_get($row, 'status') ?? data_get($row, 'title'),
                ];
            }

            return [
                'carrier' => 'snapp',
                'status' => (string) (data_get($json, 'status') ?? data_get($json, 'state')),
                'events' => $events,
                'tracking_url' => data_get($json, 'tracking_url'),
            ];
        } catch (\Throwable) {
            return [
                'carrier' => 'snapp',
                'status' => 'error',
                'events' => [],
                'tracking_url' => null,
            ];
        }
    }
}
