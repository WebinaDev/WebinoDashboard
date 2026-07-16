<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\OpenApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Native-apps contract surface — serves the live OpenAPI document.
 * Prefer GET /api/v1/openapi.json for new clients.
 */
class MobileContractController extends Controller
{
    public function show(Request $request, OpenApiController $openApi): JsonResponse
    {
        return $openApi->show();
    }
}
