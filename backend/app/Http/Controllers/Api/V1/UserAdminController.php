<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Users\UserAdminService;
use Illuminate\Http\Request;

class UserAdminController extends Controller
{
    public function __construct(protected UserAdminService $users) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $payload = $this->users->index($request);

        return response()->json($payload);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $this->users->store($request);

        return response()->json(['data' => $user], 201);
    }

    public function show(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $this->users->show($request, $user)]);
    }

    public function update(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        $updated = $this->users->update($request, $user);

        return response()->json(['data' => $updated]);
    }

    public function destroy(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        $this->users->destroy($request, $user);

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function bulkRole(Request $request): \Illuminate\Http\JsonResponse
    {
        $count = $this->users->bulkRole($request);

        return response()->json(['data' => ['updated' => $count]]);
    }

    public function resetPassword(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        $updated = $this->users->resetPassword($request, $user);

        return response()->json(['data' => $updated]);
    }
}
