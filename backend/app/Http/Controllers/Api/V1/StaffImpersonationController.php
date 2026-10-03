<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Auth\StaffImpersonationException;
use App\Services\Auth\StaffImpersonationService;
use App\Support\AuthCookie;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffImpersonationController extends Controller
{
    public function exchange(Request $request, StaffImpersonationService $service): JsonResponse
    {
        $data = $request->validate([
            'token' => ['nullable', 'string', 'max:24576'],
        ]);

        try {
            $result = $service->exchange($request, $data['token'] ?? null);
        } catch (StaffImpersonationException $e) {
            return $service->clearTransportCookie($this->error($e), $request);
        }

        $response = AuthCookie::attach(response()->json([
            'user' => $result['user'],
            'password_must_change' => false,
            'setup_completed' => (bool) ($result['user']->tenant?->setup_completed ?? true),
            'impersonation' => $result['impersonation'],
        ]), $result['plain'], $request, $result['minutes']);

        return $service->clearTransportCookie($response, $request);
    }

    public function show(Request $request, StaffImpersonationService $service): JsonResponse
    {
        if ($request->boolean('refresh')) {
            $service->refreshSites($request);
        }

        return response()->json($service->publicPayload($request) ?? ['active' => false]);
    }

    public function switch(Request $request, StaffImpersonationService $service): JsonResponse
    {
        $data = $request->validate([
            'site_id' => ['required', 'string', 'max:64'],
        ]);

        try {
            $url = $service->switchSite($request, $data['site_id']);
        } catch (StaffImpersonationException $e) {
            return $this->error($e);
        }

        return response()->json(['switch_url' => $url]);
    }

    public function exit(Request $request, StaffImpersonationService $service): JsonResponse
    {
        try {
            $returnUrl = $service->terminate($request);
        } catch (StaffImpersonationException $e) {
            return $this->error($e);
        }

        $response = AuthCookie::clear(response()->json([
            'return_url' => $returnUrl,
            'message' => __('api.logged_out'),
        ]), $request);

        return $service->clearTransportCookie($response, $request);
    }

    private function error(StaffImpersonationException $e): JsonResponse
    {
        return response()->json([
            'message' => $e->getMessage(),
            'errors' => ['code' => $e->errorCode],
        ], $e->status);
    }
}
