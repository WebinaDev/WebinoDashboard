<?php

namespace App\Http\Controllers\Api\V1\Membership;

use App\Http\Controllers\Controller;
use App\Models\Membership\MembershipGrant;
use App\Models\Membership\MembershipPlan;
use App\Models\Product;
use App\Models\User;
use App\Services\Membership\MembershipPresenter;
use App\Services\Membership\MembershipService;
use App\Services\Membership\MembershipSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Admin: premium plans, membership settings (discount, download quota, comparison rows) and members. */
class MembershipAdminController extends Controller
{
    public function __construct(protected MembershipService $membership, protected MembershipSettings $settings) {}

    protected function tid(Request $request): int
    {
        $tid = (int) $request->user()->tenant_id;
        abort_if($tid <= 0, 404);

        return $tid;
    }

    public function plans(Request $request): JsonResponse
    {
        $rows = MembershipPlan::query()->where('tenant_id', $this->tid($request))->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => $rows->map(fn ($p) => MembershipPresenter::plan($p, true))->all()]);
    }

    public function storePlan(Request $request): JsonResponse
    {
        $plan = $this->savePlan($request, new MembershipPlan(['tenant_id' => $this->tid($request)]));

        return response()->json(['data' => MembershipPresenter::plan($plan, true)], 201);
    }

    public function updatePlan(Request $request, int $plan): JsonResponse
    {
        $row = MembershipPlan::query()->where('tenant_id', $this->tid($request))->findOrFail($plan);

        return response()->json(['data' => MembershipPresenter::plan($this->savePlan($request, $row), true)]);
    }

    public function destroyPlan(Request $request, int $plan): JsonResponse
    {
        $row = MembershipPlan::query()->where('tenant_id', $this->tid($request))->findOrFail($plan);
        DB::transaction(function () use ($row) {
            // Past orders keep their product; it just stops being sold.
            if ($row->product_id) {
                Product::query()->where('tenant_id', $row->tenant_id)->whereKey($row->product_id)->update(['status' => 'draft', 'is_available' => false]);
            }
            $row->delete();
        });

        return response()->json(['ok' => true]);
    }

    protected function savePlan(Request $request, MembershipPlan $plan): MembershipPlan
    {
        $req = $plan->exists ? 'sometimes' : 'required';
        $data = $request->validate([
            'name' => [$req, 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[\pL\pN\-]+$/u',
                Rule::unique('membership_plans', 'slug')->where('tenant_id', $plan->tenant_id)->ignore($plan->id)],
            'description' => ['nullable', 'string', 'max:5000'],
            'duration_value' => [$req, 'integer', 'min:1', 'max:3650'],
            'duration_unit' => [$req, Rule::in(MembershipPlan::UNITS)],
            'price_minor' => [$req, 'integer', 'min:0'],
            'sale_price_minor' => ['nullable', 'integer', 'min:0'],
            'currency' => ['nullable', 'string', 'max:8'],
            'badge' => ['nullable', 'string', 'max:80'],
            'is_featured' => ['boolean'],
            'is_active' => ['boolean'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);
        if (! $plan->exists && empty($data['slug'])) {
            $base = trim(preg_replace('/[^\pL\pN]+/u', '-', mb_strtolower((string) $data['name'])) ?? '', '-') ?: Str::random(6);
            $slug = $base;
            $i = 2;
            while (MembershipPlan::query()->where('tenant_id', $plan->tenant_id)->where('slug', $slug)->exists()) {
                $slug = $base.'-'.$i++;
            }
            $data['slug'] = $slug;
        } elseif (array_key_exists('slug', $data) && empty($data['slug'])) {
            unset($data['slug']);
        }
        if (array_key_exists('sort', $data) && $data['sort'] === null) {
            unset($data['sort']);
        }

        return DB::transaction(function () use ($plan, $data) {
            $plan->fill($data)->save();
            $this->membership->syncPlanProduct($plan);

            return $plan->fresh();
        });
    }

    public function showSettings(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->settings->get($this->tid($request))]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'discount_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'downloads' => ['sometimes', 'array'],
            'downloads.free_audio' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'downloads.free_video' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'downloads.period' => ['sometimes', Rule::in(MembershipSettings::PERIODS)],
            'staff_full_access' => ['sometimes', 'boolean'],
            'features' => ['sometimes', 'array', 'max:60'],
            'features.*.key' => ['nullable', 'string', 'max:60'],
            'features.*.label' => ['nullable', 'string', 'max:160'],
            'features.*.free' => ['nullable'],
            'features.*.premium' => ['nullable'],
            'features.*.sort' => ['nullable', 'integer'],
        ]);

        return response()->json(['data' => $this->settings->put($this->tid($request), $data)]);
    }

    public function members(Request $request): JsonResponse
    {
        $tid = $this->tid($request);
        $q = User::query()->where('tenant_id', $tid)
            ->where(fn ($w) => $w->whereNotNull('premium_until')->orWhereIn('id', MembershipGrant::query()->where('tenant_id', $tid)->select('user_id')));
        if ($s = trim((string) $request->query('q', ''))) {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $s).'%';
            $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('phone', 'like', $like)->orWhere('email', 'like', $like));
        }
        if ($request->query('status') === 'active') {
            $q->where('premium_until', '>', now());
        } elseif ($request->query('status') === 'expired') {
            $q->where(fn ($w) => $w->whereNull('premium_until')->orWhere('premium_until', '<=', now()));
        }
        $page = $q->orderByDesc('premium_until')->orderByDesc('id')->paginate(min(100, max(1, (int) $request->query('per_page', 30))));

        return response()->json([
            'data' => collect($page->items())->map(fn (User $u) => MembershipPresenter::member($u, $this->membership))->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function memberGrants(Request $request, int $user): JsonResponse
    {
        $tid = $this->tid($request);
        $u = User::query()->where('tenant_id', $tid)->findOrFail($user);
        $rows = MembershipGrant::query()->with('plan')->where('tenant_id', $tid)->where('user_id', $u->id)->orderByDesc('id')->get();

        return response()->json(['data' => [
            'member' => MembershipPresenter::member($u, $this->membership),
            'grants' => $rows->map(fn ($g) => MembershipPresenter::grant($g))->all(),
        ]]);
    }

    public function grant(Request $request, int $user): JsonResponse
    {
        $tid = $this->tid($request);
        $u = User::query()->where('tenant_id', $tid)->findOrFail($user);
        $data = $request->validate([
            'plan_id' => ['nullable', 'integer', Rule::exists('membership_plans', 'id')->where('tenant_id', $tid)],
            'duration_value' => ['required_without:plan_id', 'nullable', 'integer', 'min:1', 'max:3650'],
            'duration_unit' => ['required_without:plan_id', 'nullable', Rule::in(MembershipPlan::UNITS)],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $plan = ! empty($data['plan_id']) ? MembershipPlan::query()->find($data['plan_id']) : null;
        $g = $this->membership->grant($u, (int) ($data['duration_value'] ?? $plan->duration_value), (string) ($data['duration_unit'] ?? $plan->duration_unit), [
            'plan_id' => $plan?->id, 'source' => 'admin', 'note' => $data['note'] ?? null, 'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => ['grant' => MembershipPresenter::grant($g->load('plan')), 'member' => MembershipPresenter::member($u->fresh(), $this->membership)]], 201);
    }

    public function revoke(Request $request, int $grant): JsonResponse
    {
        $g = MembershipGrant::query()->where('tenant_id', $this->tid($request))->findOrFail($grant);
        $this->membership->revoke($g);
        $u = User::query()->find($g->user_id);

        return response()->json(['data' => ['grant' => MembershipPresenter::grant($g->fresh()->load('plan')), 'member' => $u ? MembershipPresenter::member($u, $this->membership) : null]]);
    }
}
