<?php

namespace App\Services\Geo;

final class IranGeoService
{
    /** @var array{states: array<string, string>, cities: array<string, list<string>>}|null */
    private static ?array $cache = null;

    /** @return array{states: array<string, string>, cities: array<string, list<string>>} */
    public function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $path = resource_path('data/iran_state_city.json');
        if (! is_file($path)) {
            self::$cache = ['states' => [], 'cities' => []];

            return self::$cache;
        }

        /** @var array{states?: array<string, string>, cities?: array<string, list<string>>} $decoded */
        $decoded = json_decode((string) file_get_contents($path), true) ?: [];
        self::$cache = [
            'states' => is_array($decoded['states'] ?? null) ? $decoded['states'] : [],
            'cities' => is_array($decoded['cities'] ?? null) ? $decoded['cities'] : [],
        ];

        return self::$cache;
    }

    /** @return array<string, string> code => name */
    public function states(): array
    {
        return $this->all()['states'];
    }

    /** @return list<string> */
    public function cities(string $stateCode): array
    {
        $code = strtoupper(trim($stateCode));

        return $this->all()['cities'][$code] ?? [];
    }

    public function stateName(string $stateCode): ?string
    {
        $code = strtoupper(trim($stateCode));

        return $this->states()[$code] ?? null;
    }
}
