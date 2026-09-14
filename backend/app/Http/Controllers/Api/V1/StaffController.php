<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $search = trim((string) $request->query('search', ''));

        $query = User::query()
            ->where('tenant_id', $tid)
            ->whereIn('role', ['admin', 'staff'])
            ->when($search !== '', function ($w) use ($search) {
                $like = '%'.$search.'%';
                $w->where(function ($x) use ($like) {
                    $x->where('name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('name');

        $paginator = $query->paginate(min(100, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->where('tenant_id', $tid)],
            'password' => 'required|string|min:8',
            'role' => 'nullable|string|in:admin,staff',
            'is_active' => 'nullable|boolean',
        ]);

        $user = User::query()->create([
            'tenant_id' => $tid,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'role' => $data['role'] ?? 'staff',
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, int $staff): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $user = User::query()
            ->where('tenant_id', $tid)
            ->whereIn('role', ['admin', 'staff'])
            ->findOrFail($staff);

        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->where('tenant_id', $tid)->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role' => 'nullable|string|in:admin,staff',
            'is_active' => 'nullable|boolean',
        ]);

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json(['data' => $user->fresh()]);
    }
}
