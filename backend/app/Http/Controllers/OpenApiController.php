<?php

namespace App\Http\Controllers;

use Dedoc\Scramble\Generator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class OpenApiController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        // Production: deny by default unless OPENAPI_PUBLIC=true or staff is authenticated.
        $public = filter_var(env('OPENAPI_PUBLIC', ! app()->environment('production')), FILTER_VALIDATE_BOOLEAN);
        if (! $public) {
            $user = $request->user('sanctum') ?? $request->user();
            if (! $user) {
                abort(401, 'OpenAPI requires authentication');
            }
        }

        if (class_exists(Generator::class)) {
            $spec = app(Generator::class)->generate();

            return response()->json($spec->toArray());
        }

        $path = storage_path('app/openapi.json');
        if (File::isFile($path)) {
            $json = json_decode(File::get($path), true);

            return response()->json(is_array($json) ? $json : []);
        }

        return response()->json([
            'openapi' => '3.1.0',
            'info' => ['title' => 'Webino Dashboard API', 'version' => '1.0.0'],
            'paths' => new \stdClass,
        ]);
    }
}
