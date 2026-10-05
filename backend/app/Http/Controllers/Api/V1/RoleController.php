<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\UpdateRoleRequest;
use App\Models\RoleCapability;
use App\Models\RoleMenuAcl;
use App\Models\User;
use App\Services\Users\UserAdminService;
use App\Support\CapabilityChecker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RoleController extends Controller
{
    public function __construct(private readonly UserAdminService $users) {}

    /** @var list<string> */
    private function predefinedRoles(): array
    {
        /** @var list<string> $roles */
        $roles = config('capabilities.roles', []);

        return $roles;
    }

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $counts = User::query()
            ->where('tenant_id', $tid)
            ->selectRaw('role, count(*) as total')
            ->groupBy('role')
            ->pluck('total', 'role');

        $capabilitiesByRole = RoleCapability::query()
            ->whereIn('role', $this->predefinedRoles())
            ->orderBy('role')
            ->orderBy('capability')
            ->get()
            ->groupBy('role')
            ->map(fn ($rows) => $rows->pluck('capability')->values()->all());

        $roles = array_map(fn (string $role) => [
            'name' => $role,
            'users_count' => (int) ($counts[$role] ?? 0),
            'capabilities' => $capabilitiesByRole[$role] ?? [],
        ], $this->predefinedRoles());

        $permissions = [];
        foreach ($this->predefinedRoles() as $role) {
            $permissions[$role] = $capabilitiesByRole[$role] ?? [];
        }

        /** @var list<string> $catalog */
        $catalog = config('capabilities.catalog', []);

        return response()->json([
            'data' => [
                'roles' => $roles,
                'permissions' => $permissions,
                'available_capabilities' => array_values($catalog),
            ],
        ]);
    }

    public function update(UpdateRoleRequest $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validated();
        $tid = $request->user()->tenant_id;
        $user = User::query()->where('tenant_id', $tid)->findOrFail($data['user_id']);
        $role = (string) $data['role'];

        $this->users->assertCanAssignRole($request, $role);

        // Forbid self-promotion to admin (defense in depth alongside assertCanAssignRole).
        if (
            (int) $request->user()->id === (int) $user->id
            && $role === 'admin'
            && (string) $user->role !== 'admin'
        ) {
            throw ValidationException::withMessages([
                'role' => ['You cannot promote yourself to admin.'],
            ]);
        }

        $user->forceFill(['role' => $role])->save();

        return response()->json(['data' => $user->fresh()]);
    }

    public function updateCapabilities(Request $request): \Illuminate\Http\JsonResponse
    {
        $roles = $this->predefinedRoles();
        /** @var list<string> $catalog */
        $catalog = config('capabilities.catalog', []);

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($roles)],
            'capabilities' => 'required|array',
            'capabilities.*' => ['required', 'string', 'max:128', Rule::in($catalog)],
        ]);

        if ($data['role'] === 'admin') {
            return response()->json([
                'message' => __('validation.failed'),
                'errors' => ['role' => [__('api.forbidden')]],
            ], 422);
        }

        $capabilities = array_values(array_unique(array_map('strval', $data['capabilities'])));

        DB::transaction(function () use ($data, $capabilities): void {
            RoleCapability::query()->where('role', $data['role'])->delete();
            $now = now();
            foreach ($capabilities as $capability) {
                RoleCapability::query()->create([
                    'role' => $data['role'],
                    'capability' => $capability,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });

        CapabilityChecker::flushRoleCache($data['role']);

        return response()->json([
            'data' => [
                'role' => $data['role'],
                'capabilities' => $capabilities,
            ],
        ]);
    }

    public function menuAclIndex(): \Illuminate\Http\JsonResponse
    {
        $rows = RoleMenuAcl::query()
            ->orderBy('role')
            ->orderBy('menu_key')
            ->get()
            ->groupBy('role')
            ->map(fn ($group) => $group->map(fn (RoleMenuAcl $row) => [
                'menu_key' => $row->menu_key,
                'allowed' => $row->allowed,
            ])->values()->all());

        return response()->json(['data' => ['menu_acl' => $rows]]);
    }

    public function menuAclUpdate(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($this->predefinedRoles())],
            'entries' => 'required|array',
            'entries.*.menu_key' => 'required|string|max:128',
            'entries.*.allowed' => 'required|boolean',
        ]);

        DB::transaction(function () use ($data): void {
            RoleMenuAcl::query()->where('role', $data['role'])->delete();
            $now = now();
            foreach ($data['entries'] as $entry) {
                RoleMenuAcl::query()->create([
                    'role' => $data['role'],
                    'menu_key' => $entry['menu_key'],
                    'allowed' => (bool) $entry['allowed'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });

        return response()->json(['data' => ['role' => $data['role'], 'updated' => count($data['entries'])]]);
    }
}
