<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Http\Request;

class ModirPayamakController extends Controller
{
    public function __construct(protected ModirPayamakClient $client) {}

    public function proxy(Request $request, string $path = ''): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        /** @var Tenant $tenant */
        $tenant = Tenant::query()->findOrFail($user->tenant_id);
        $path = trim($path, '/');

        if ($request->isMethod('get') || $request->isMethod('head')) {
            $result = $this->client->get($tenant, $path, $request->query());
        } else {
            $body = $request->all();
            unset($body['path']);
            $result = $this->client->post($tenant, $path, $body);
        }

        return response()->json($result['data'], $result['status']);
    }
}
