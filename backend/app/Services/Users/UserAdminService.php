<?php

namespace App\Services\Users;

use App\Models\BotSession;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserAdminService
{
    /** @var list<string> */
    public const ROLES = [
        'admin',
        'staff',
        'shop_manager',
        'seller',
        'accountant',
        'author',
        'editor',
        'customer',
        'partner',
        'subscriber',
    ];

    /** @return array{data: list<array<string, mixed>>, meta: array<string, mixed>} */
    public function index(Request $request, ?array $roles = null): array
    {
        $tid = $request->user()->tenant_id;
        $search = trim((string) $request->query('search', $request->query('q', '')));
        $role = trim((string) $request->query('role', ''));
        $bot = trim((string) $request->query('bot', ''));

        $query = User::query()->where('tenant_id', $tid);

        if ($roles !== null) {
            $query->whereIn('role', $roles);
        } elseif ($role !== '' && in_array($role, self::ROLES, true)) {
            $query->where('role', $role);
        }

        if (in_array($bot, ['bale', 'telegram'], true)) {
            $query->whereIn('id', function ($sub) use ($tid, $bot) {
                $sub->select('user_id')
                    ->from('bot_sessions')
                    ->where('tenant_id', $tid)
                    ->where('provider', $bot)
                    ->whereNotNull('user_id');
            });
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('username', 'like', $like)
                    ->orWhere('national_id', 'like', $like)
                    ->orWhere('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like);
            });
        }

        if (in_array($request->query('status'), ['active', 'inactive'], true)) {
            $query->where('is_active', $request->query('status') === 'active');
        }

        $query->orderByDesc('id');

        $paginator = $query->paginate(min(100, max(1, (int) $request->query('per_page', 20))));
        $items = collect($paginator->items());
        $botMap = $this->botProvidersForUsers($tid, $items->pluck('id')->all());

        $data = $items->map(fn (User $u) => $this->serializeListUser($u, $botMap[$u->id] ?? []))->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'role_counts' => $this->roleCounts($tid, $roles),
            ],
        ];
    }

    /** @return array<string, int> */
    public function roleCounts(int $tenantId, ?array $roles = null): array
    {
        $q = User::query()
            ->where('tenant_id', $tenantId)
            ->select('role', DB::raw('count(*) as c'))
            ->groupBy('role');

        if ($roles !== null) {
            $q->whereIn('role', $roles);
        }

        $counts = [];
        foreach (self::ROLES as $r) {
            $counts[$r] = 0;
        }
        foreach ($q->get() as $row) {
            $role = (string) $row->role;
            $counts[$role] = (int) $row->c;
        }

        return $counts;
    }

    public function store(Request $request, ?string $forcedRole = null): User
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'name' => 'nullable|string|max:120',
            'first_name' => 'nullable|string|max:80',
            'last_name' => 'nullable|string|max:80',
            'username' => ['nullable', 'string', 'max:64', Rule::unique('users', 'username')->where('tenant_id', $tid)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->where('tenant_id', $tid)],
            'phone' => ['nullable', 'string', 'max:32', Rule::unique('users', 'phone')->where('tenant_id', $tid)],
            'password' => 'nullable|string|min:8',
            'role' => ['nullable', 'string', Rule::in(self::ROLES)],
            'is_active' => 'nullable|boolean',
            'national_id' => 'nullable|string|max:20',
            'job' => 'nullable|string|max:120',
            'birth_date' => 'nullable|date',
            'landline' => 'nullable|string|max:32',
            'bank_sheba' => 'nullable|string|max:32',
            'bank_name' => 'nullable|string|max:120',
            'bank_account' => 'nullable|string|max:64',
            'bank_card' => 'nullable|string|max:24',
            'wallet_balance_minor' => 'nullable|integer|min:0',
        ]);

        $role = $forcedRole ?? ($data['role'] ?? 'customer');
        if ($forcedRole !== null) {
            $data['role'] = $forcedRole;
        }

        if (empty($data['phone']) && empty($data['email'])) {
            throw ValidationException::withMessages([
                'phone' => ['Phone or email is required.'],
            ]);
        }

        $name = $this->resolveDisplayName($data);

        return User::query()->create([
            'tenant_id' => $tid,
            'name' => $name,
            'username' => $data['username'] ?? null,
            'first_name' => $data['first_name'] ?? null,
            'last_name' => $data['last_name'] ?? null,
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'password' => Hash::make($data['password'] ?? bin2hex(random_bytes(8))),
            'role' => $role,
            'is_active' => $data['is_active'] ?? true,
            'national_id' => $data['national_id'] ?? null,
            'job' => $data['job'] ?? null,
            'birth_date' => $data['birth_date'] ?? null,
            'landline' => $data['landline'] ?? null,
            'bank_sheba' => $data['bank_sheba'] ?? null,
            'bank_name' => $data['bank_name'] ?? null,
            'bank_account' => $data['bank_account'] ?? null,
            'bank_card' => $data['bank_card'] ?? null,
            'wallet_balance_minor' => (int) ($data['wallet_balance_minor'] ?? 0),
        ]);
    }

    /** @return array<string, mixed> */
    public function show(Request $request, int $userId): array
    {
        $tid = $request->user()->tenant_id;
        $user = User::query()->where('tenant_id', $tid)->findOrFail($userId);

        $recentOrders = Order::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->limit(10)
            ->get(['id', 'number', 'status', 'total_minor', 'created_at']);

        $reviews = ProductReview::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->with(['product:id,name'])
            ->orderByDesc('id')
            ->limit(20)
            ->get();

        $wishlistIds = is_array($user->wishlist) ? array_values(array_filter(array_map('intval', $user->wishlist))) : [];
        $wishlistProducts = $wishlistIds === []
            ? collect()
            : Product::query()
                ->where('tenant_id', $tid)
                ->whereIn('id', $wishlistIds)
                ->get(['id', 'name', 'slug', 'price_minor']);

        $botSessions = BotSession::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $user->id)
            ->get(['id', 'provider', 'chat_id', 'last_seen_at']);

        $botMap = $this->botProvidersForUsers($tid, [$user->id]);

        return [
            'user' => array_merge($this->serializeDetailUser($user), [
                'bot_providers' => $botMap[$user->id] ?? [],
            ]),
            'recent_orders' => $recentOrders,
            'reviews' => $reviews,
            'wishlist' => $wishlistProducts,
            'bot_sessions' => $botSessions,
            'addresses' => is_array($user->addresses) ? $user->addresses : [],
        ];
    }

    public function update(Request $request, int $userId, ?array $roles = null): User
    {
        $tid = $request->user()->tenant_id;
        $user = User::query()->where('tenant_id', $tid)->findOrFail($userId);

        if ($roles !== null && ! in_array((string) $user->role, $roles, true)) {
            abort(404);
        }

        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'first_name' => 'nullable|string|max:80',
            'last_name' => 'nullable|string|max:80',
            'username' => ['nullable', 'string', 'max:64', Rule::unique('users', 'username')->where('tenant_id', $tid)->ignore($user->id)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->where('tenant_id', $tid)->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:32', Rule::unique('users', 'phone')->where('tenant_id', $tid)->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role' => ['nullable', 'string', Rule::in(self::ROLES)],
            'is_active' => 'nullable|boolean',
            'national_id' => 'nullable|string|max:20',
            'job' => 'nullable|string|max:120',
            'birth_date' => 'nullable|date',
            'landline' => 'nullable|string|max:32',
            'bank_sheba' => 'nullable|string|max:32',
            'bank_name' => 'nullable|string|max:120',
            'bank_account' => 'nullable|string|max:64',
            'bank_card' => 'nullable|string|max:24',
            'wallet_balance_minor' => 'nullable|integer|min:0',
            'loyalty_points' => 'nullable|integer|min:0',
            'addresses' => 'nullable|array',
            'wishlist' => 'nullable|array',
        ]);

        if ($roles !== null && isset($data['role']) && ! in_array($data['role'], $roles, true)) {
            unset($data['role']);
        }

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        if (array_key_exists('first_name', $data) || array_key_exists('last_name', $data) || array_key_exists('name', $data)) {
            $merged = array_merge($user->only(['name', 'first_name', 'last_name']), $data);
            $data['name'] = $this->resolveDisplayName($merged);
        }

        $user->update($data);

        return $user->fresh();
    }

    public function destroy(Request $request, int $userId): void
    {
        $tid = $request->user()->tenant_id;
        if ($request->user()->id === $userId) {
            throw ValidationException::withMessages(['user' => ['Cannot delete your own account.']]);
        }

        $user = User::query()->where('tenant_id', $tid)->findOrFail($userId);

        if (Order::query()->where('tenant_id', $tid)->where('user_id', $user->id)->exists()) {
            throw ValidationException::withMessages(['user' => ['User has orders and cannot be deleted.']]);
        }

        BotSession::query()->where('tenant_id', $tid)->where('user_id', $user->id)->update(['user_id' => null]);
        $user->delete();
    }

    /** @param array<int> $ids */
    public function bulkRole(Request $request): int
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', Rule::exists('users', 'id')->where('tenant_id', $tid)],
            'role' => ['required', 'string', Rule::in(self::ROLES)],
        ]);

        return User::query()
            ->where('tenant_id', $tid)
            ->whereIn('id', $data['ids'])
            ->update(['role' => $data['role']]);
    }

    public function resetPassword(Request $request, int $userId): User
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'password' => 'nullable|string|min:8',
        ]);

        $user = User::query()->where('tenant_id', $tid)->findOrFail($userId);
        $user->update([
            'password' => Hash::make($data['password'] ?? bin2hex(random_bytes(8))),
            'password_must_change' => true,
        ]);

        return $user->fresh();
    }

    /** @param array<string, mixed> $data */
    private function resolveDisplayName(array $data): string
    {
        $first = trim((string) ($data['first_name'] ?? ''));
        $last = trim((string) ($data['last_name'] ?? ''));
        $combined = trim($first.' '.$last);
        if ($combined !== '') {
            return mb_substr($combined, 0, 120);
        }

        $name = trim((string) ($data['name'] ?? ''));

        return $name !== '' ? mb_substr($name, 0, 120) : 'User';
    }

    /** @param list<int> $userIds @return array<int, list<string>> */
    private function botProvidersForUsers(int $tenantId, array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $rows = BotSession::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('user_id', $userIds)
            ->select('user_id', 'provider')
            ->distinct()
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $uid = (int) $row->user_id;
            $map[$uid] ??= [];
            if (! in_array($row->provider, $map[$uid], true)) {
                $map[$uid][] = (string) $row->provider;
            }
        }

        return $map;
    }

    /** @param list<string> $botProviders @return array<string, mixed> */
    private function serializeListUser(User $user, array $botProviders): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'is_active' => $user->is_active,
            'wallet_balance_minor' => $user->wallet_balance_minor,
            'loyalty_points' => $user->loyalty_points,
            'bot_providers' => $botProviders,
            'created_at' => $user->created_at,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDetailUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'landline' => $user->landline,
            'role' => $user->role,
            'is_active' => $user->is_active,
            'national_id' => $user->national_id,
            'job' => $user->job,
            'birth_date' => $user->birth_date,
            'bank_sheba' => $user->bank_sheba,
            'bank_name' => $user->bank_name,
            'bank_account' => $user->bank_account,
            'bank_card' => $user->bank_card,
            'wallet_balance_minor' => $user->wallet_balance_minor,
            'loyalty_points' => $user->loyalty_points,
            'created_at' => $user->created_at,
        ];
    }
}
