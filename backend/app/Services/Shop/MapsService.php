<?php

namespace App\Services\Shop;

use Illuminate\Support\Facades\Http;

final class MapsService
{
    /**
     * @return list<array{title: string, address: string, lat: float|null, lng: float|null}>
     */
    public function search(int $tenantId, string $query): array
    {
        $settings = ShopSettings::getMaps($tenantId);
        if (empty($settings['billing_map_enabled'])) {
            return [];
        }

        $key = (string) ($settings['service_api_key'] ?: $settings['api_key'] ?? '');
        if ($key === '') {
            return [];
        }

        $q = trim($query);
        if ($q === '') {
            return [];
        }

        return match ($settings['provider'] ?? 'neshan') {
            'mapbox' => $this->searchMapbox($key, $q),
            default => $this->searchNeshan($key, $q),
        };
    }

    /**
     * @return list<array{title: string, address: string, lat: float|null, lng: float|null}>
     */
    private function searchNeshan(string $key, string $q): array
    {
        $res = Http::timeout(10)
            ->withHeaders(['Api-Key' => $key])
            ->get('https://api.neshan.org/v1/search', ['term' => $q, 'lat' => 35.6892, 'lng' => 51.3890]);

        if (! $res->ok()) {
            return [];
        }

        $items = [];
        foreach ((array) data_get($res->json(), 'items', []) as $row) {
            $items[] = [
                'title' => (string) ($row['title'] ?? ''),
                'address' => (string) ($row['address'] ?? $row['title'] ?? ''),
                'lat' => isset($row['location']['y']) ? (float) $row['location']['y'] : null,
                'lng' => isset($row['location']['x']) ? (float) $row['location']['x'] : null,
            ];
        }

        return $items;
    }

    /**
     * @return list<array{title: string, address: string, lat: float|null, lng: float|null}>
     */
    private function searchMapbox(string $key, string $q): array
    {
        $res = Http::timeout(10)->get(
            'https://api.mapbox.com/geocoding/v5/mapbox.places/'.rawurlencode($q).'.json',
            ['access_token' => $key, 'limit' => 5, 'language' => 'fa']
        );
        if (! $res->ok()) {
            return [];
        }
        $items = [];
        foreach ((array) data_get($res->json(), 'features', []) as $row) {
            $center = $row['center'] ?? [null, null];
            $items[] = [
                'title' => (string) ($row['text'] ?? ''),
                'address' => (string) ($row['place_name'] ?? ''),
                'lat' => isset($center[1]) ? (float) $center[1] : null,
                'lng' => isset($center[0]) ? (float) $center[0] : null,
            ];
        }

        return $items;
    }
}
