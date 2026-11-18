<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\UpdateRoleRequest;
use App\Models\RoleCapability;
use App\Models\RoleMenuAcl;
use App\Models\UserCapabilityOverride;
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

        $capabilitiesByRole = collect($this->predefinedRoles())->mapWithKeys(function (string $role) use ($tid): array {
            $tenantRules = RoleCapability::query()->where('tenant_id', $tid)->where('role', $role)->orderBy('capability')->pluck('capability');
            $configured = DB::table('tenant_role_access_settings')->where('tenant_id', $tid)->where('role', $role)->value('capabilities_configured');
            $rules = $configured ? $tenantRules : RoleCapability::query()->whereNull('tenant_id')->where('role', $role)->orderBy('capability')->pluck('capability');
            return [$role => $rules->values()->all()];
        });

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
            'capabilities' => 'present|array',
            'capabilities.*' => ['required', 'string', 'max:128', Rule::in($catalog)],
        ]);

        if ($data['role'] === 'admin') {
            return response()->json([
                'message' => __('validation.failed'),
                'errors' => ['role' => [__('api.forbidden')]],
            ], 422);
        }

        $capabilities = array_values(array_unique(array_map('strval', $data['capabilities'])));

        $tenantId = (int) $request->user()->tenant_id;
        DB::transaction(function () use ($data, $capabilities, $tenantId): void {
            RoleCapability::query()->where('tenant_id', $tenantId)->where('role', $data['role'])->delete();
            $now = now();
            foreach ($capabilities as $capability) {
                RoleCapability::query()->create([
                    'tenant_id' => $tenantId,
                    'role' => $data['role'],
                    'capability' => $capability,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
            DB::table('tenant_role_access_settings')->updateOrInsert(
                ['tenant_id' => $tenantId, 'role' => $data['role']],
                ['capabilities_configured' => true, 'updated_at' => now(), 'created_at' => now()]
            );
        });

        CapabilityChecker::flushRoleCache($data['role']);

        return response()->json([
            'data' => [
                'role' => $data['role'],
                'capabilities' => $capabilities,
            ],
        ]);
    }

    public function users(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $users = User::query()->where('tenant_id', $tenantId)
            ->whereIn('role', ['admin', 'staff', 'shop_manager', 'seller', 'accountant', 'author', 'editor'])
            ->orderBy('name')->get(['id', 'name', 'email', 'role', 'is_active']);
        $overrides = UserCapabilityOverride::query()->where('tenant_id', $tenantId)
            ->whereIn('user_id', $users->pluck('id'))
            ->orderBy('capability')->get(['user_id', 'capability', 'effect']);

        return response()->json(['data' => [
            'users' => $users,
            'overrides' => $overrides->groupBy('user_id'),
            'available_capabilities' => array_values(config('capabilities.catalog', [])),
        ]]);
    }

    public function updateUserCapabilities(Request $request, int $userId): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $target = User::query()->where('tenant_id', $tenantId)->findOrFail($userId);
        abort_if((int) $target->id === (int) $request->user()->id, 422, 'You cannot change your own capability overrides.');
        abort_if((string) $target->role === 'admin', 422, 'Admin capabilities cannot be overridden.');

        $catalog = array_values(config('capabilities.catalog', []));
        $data = $request->validate([
            'overrides' => 'present|array|max:'.count($catalog),
            'overrides.*.capability' => ['required', 'string', 'max:128', Rule::in($catalog)],
            'overrides.*.effect' => ['required', Rule::in(['allow', 'deny'])],
        ]);
        $protected = ['rbac.manage', 'users.manage', '*'];
        foreach ($data['overrides'] as $override) {
            abort_if(in_array($override['capability'], $protected, true), 422, 'Administrative capabilities cannot be assigned as user overrides.');
        }
        $entries = collect($data['overrides'])->keyBy('capability');
        abort_if($entries->count() !== count($data['overrides']), 422, 'Each capability can only have one override.');

        DB::transaction(function () use ($tenantId, $target, $request, $entries): void {
            UserCapabilityOverride::query()->where('tenant_id', $tenantId)->where('user_id', $target->id)->delete();
            foreach ($entries as $capability => $override) {
                UserCapabilityOverride::query()->create([
                    'tenant_id' => $tenantId,
                    'user_id' => $target->id,
                    'capability' => $capability,
                    'effect' => $override['effect'],
                    'granted_by' => $request->user()->id,
                ]);
            }
        });

        return response()->json(['data' => [
            'user_id' => $target->id,
            'overrides' => $entries->values(),
        ]]);
    }

    public function menuAclIndex(): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) request()->user()->tenant_id;
        $rows = collect($this->predefinedRoles())->mapWithKeys(function (string $role) use ($tenantId): array {
            $tenantRows = RoleMenuAcl::query()->where('tenant_id', $tenantId)->where('role', $role)->orderBy('menu_key')->get();
            $configured = DB::table('tenant_role_access_settings')->where('tenant_id', $tenantId)->where('role', $role)->value('menu_acl_configured');
            $effectiveRows = $configured ? $tenantRows : RoleMenuAcl::query()->whereNull('tenant_id')->where('role', $role)->orderBy('menu_key')->get();
            return [$role => $effectiveRows->map(fn (RoleMenuAcl $row) => ['menu_key' => $row->menu_key, 'allowed' => $row->allowed])->values()->all()];
        });

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

        $tenantId = (int) $request->user()->tenant_id;
        DB::transaction(function () use ($data, $tenantId): void {
            RoleMenuAcl::query()->where('tenant_id', $tenantId)->where('role', $data['role'])->delete();
            $now = now();
            foreach ($data['entries'] as $entry) {
                RoleMenuAcl::query()->create([
                    'tenant_id' => $tenantId,
                    'role' => $data['role'],
                    'menu_key' => $entry['menu_key'],
                    'allowed' => (bool) $entry['allowed'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
            DB::table('tenant_role_access_settings')->updateOrInsert(
                ['tenant_id' => $tenantId, 'role' => $data['role']],
                ['menu_acl_configured' => true, 'updated_at' => now(), 'created_at' => now()]
            );
        });

        return response()->json(['data' => ['role' => $data['role'], 'updated' => count($data['entries'])]]);
    }
}
