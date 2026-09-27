<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Users\UserAdminService;
use Illuminate\Http\Request;

class StaffController extends Controller
{
    public function __construct(protected UserAdminService $users) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json($this->users->index($request, ['admin', 'staff']));
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:8',
            'role' => 'nullable|string|in:admin,staff',
        ]);
        $role = $data['role'] ?? 'staff';

        $user = $this->users->store($request, $role);

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, int $staff): \Illuminate\Http\JsonResponse
    {
        $user = $this->users->update($request, $staff, ['admin', 'staff']);

        return response()->json(['data' => $user]);
    }
}
