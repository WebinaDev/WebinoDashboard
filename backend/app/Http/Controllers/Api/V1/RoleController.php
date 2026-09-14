<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    /** @var list<string> */
    private const ROLES = ['admin', 'staff', 'customer'];

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $counts = User::query()
            ->where('tenant_id', $tid)
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        $roles = array_map(fn (string $role) => [
            'name' => $role,
            'users_count' => (int) ($counts[$role] ?? 0),
        ], self::ROLES);

        return response()->json([
            'data' => [
                'roles' => $roles,
                'permissions' => [
                    'admin' => ['*'],
                    'staff' => ['commerce.*', 'orders.*', 'catalog.*'],
                    'customer' => ['account.self'],
                ],
            ],
        ]);
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'role' => ['required', 'string', Rule::in(self::ROLES)],
        ]);

        $tid = $request->user()->tenant_id;
        $user = User::query()->where('tenant_id', $tid)->findOrFail($data['user_id']);
        $user->update(['role' => $data['role']]);

        return response()->json(['data' => $user->fresh()]);
    }
}
