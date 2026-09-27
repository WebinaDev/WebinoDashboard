<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Geo\IranGeoService;
use Illuminate\Http\Request;

class GeoController extends Controller
{
    public function states(IranGeoService $geo): \Illuminate\Http\JsonResponse
    {
        $states = [];
        foreach ($geo->states() as $code => $name) {
            $states[] = ['code' => $code, 'name' => $name];
        }

        return response()->json(['data' => ['states' => $states]])
            ->header('Cache-Control', 'public, max-age=86400');
    }

    public function cities(Request $request, IranGeoService $geo): \Illuminate\Http\JsonResponse
    {
        $code = (string) $request->query('state', '');
        if ($code === '') {
            return response()->json([
                'message' => __('validation.required', ['attribute' => 'state']),
                'errors' => ['state' => [__('validation.required', ['attribute' => 'state'])]],
            ], 422);
        }

        $cities = array_map(fn (string $name) => ['name' => $name], $geo->cities($code));

        return response()->json([
            'data' => [
                'state' => strtoupper($code),
                'state_name' => $geo->stateName($code),
                'cities' => $cities,
            ],
        ])->header('Cache-Control', 'public, max-age=86400');
    }
}
