<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LinkHubBlock;
use App\Models\LinkHubProfile;
use App\Services\LinkHub\LinkHubAliasService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LinkHubProfileController extends Controller
{
    public function overview(Request $request, LinkHubAliasService $aliases): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $tenant = $request->user()->tenant;
        $business = $this->ensureBusiness($tid);

        $aliasHost = LinkHubAliasService::hostnameFor($tenant);
        $publicUrl = $aliasHost ? 'https://'.$aliasHost : null;

        return response()->json([
            'data' => [
                'business' => $business->load('blocks'),
                'member_count' => LinkHubProfile::query()
                    ->where('tenant_id', $tid)
                    ->where('kind', LinkHubProfile::KIND_MEMBER)
                    ->count(),
                'public_url' => $publicUrl,
                'member_url_template' => $publicUrl ? $publicUrl.'/{slug}' : null,
                'alias_subdomain' => LinkHubAliasService::normalizeLabel($tenant->alias_subdomain ?? 'contact'),
                'alias_hostname' => $aliasHost,
                'primary_domain' => $tenant->domain,
                'dns_hint' => $aliasHost
                    ? 'رکورد A/AAAA برای '.$aliasHost.' را به همان سرور سایت اشاره دهید.'
                    : null,
            ],
        ]);
    }

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $this->ensureBusiness($tid);

        $rows = LinkHubProfile::query()
            ->where('tenant_id', $tid)
            ->withCount('blocks')
            ->orderByRaw("CASE WHEN kind = 'business' THEN 0 ELSE 1 END")
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, LinkHubProfile $profile): \Illuminate\Http\JsonResponse
    {
        $this->assertOwned($request, $profile);

        return response()->json(['data' => $profile->load('blocks')]);
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $this->ensureBusiness($tid);

        $data = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => [
                'required',
                'string',
                'max:64',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('link_hub_profiles', 'slug')->where(fn ($q) => $q->where('tenant_id', $tid)),
                Rule::notIn($this->reservedSlugs()),
            ],
            'avatar_url' => 'nullable|string|max:500',
            'bio' => 'nullable|string|max:5000',
            'is_published' => 'boolean',
            'theme_json' => 'nullable|array',
        ]);

        $row = LinkHubProfile::query()->create([
            'tenant_id' => $tid,
            'kind' => LinkHubProfile::KIND_MEMBER,
            'slug' => strtolower($data['slug']),
            'title' => $data['title'],
            'avatar_url' => $data['avatar_url'] ?? null,
            'bio' => $data['bio'] ?? null,
            'is_published' => (bool) ($data['is_published'] ?? false),
            'theme_json' => $data['theme_json'] ?? null,
            'sort' => (int) LinkHubProfile::query()->where('tenant_id', $tid)->max('sort') + 1,
        ]);

        return response()->json(['data' => $row], 201);
    }

    public function update(Request $request, LinkHubProfile $profile): \Illuminate\Http\JsonResponse
    {
        $this->assertOwned($request, $profile);
        $tid = (int) $request->user()->tenant_id;

        $rules = [
            'title' => 'nullable|string|max:255',
            'avatar_url' => 'nullable|string|max:500',
            'bio' => 'nullable|string|max:5000',
            'is_published' => 'boolean',
            'theme_json' => 'nullable|array',
            'sort' => 'nullable|integer|min:0',
        ];

        if ($profile->kind === LinkHubProfile::KIND_MEMBER) {
            $rules['slug'] = [
                'nullable',
                'string',
                'max:64',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('link_hub_profiles', 'slug')
                    ->where(fn ($q) => $q->where('tenant_id', $tid))
                    ->ignore($profile->id),
                Rule::notIn($this->reservedSlugs()),
            ];
        }

        $data = $request->validate($rules);
        if (isset($data['slug'])) {
            $data['slug'] = strtolower($data['slug']);
        }
        if ($profile->kind === LinkHubProfile::KIND_BUSINESS) {
            unset($data['slug']);
        }

        $profile->update($data);

        return response()->json(['data' => $profile->fresh()->load('blocks')]);
    }

    public function destroy(Request $request, LinkHubProfile $profile): \Illuminate\Http\JsonResponse
    {
        $this->assertOwned($request, $profile);
        if ($profile->kind === LinkHubProfile::KIND_BUSINESS) {
            return response()->json(['message' => 'صفحهٔ اصلی کسب‌وکار قابل حذف نیست.'], 422);
        }
        $profile->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function syncBlocks(Request $request, LinkHubProfile $profile): \Illuminate\Http\JsonResponse
    {
        $this->assertOwned($request, $profile);
        $tid = (int) $request->user()->tenant_id;

        $data = $request->validate([
            'blocks' => 'required|array|max:100',
            'blocks.*.id' => 'nullable|integer',
            'blocks.*.type' => ['required', Rule::in(LinkHubBlock::TYPES)],
            'blocks.*.sort' => 'nullable|integer|min:0',
            'blocks.*.is_visible' => 'boolean',
            'blocks.*.payload' => 'nullable|array',
        ]);

        $keepIds = [];
        foreach (array_values($data['blocks']) as $i => $item) {
            $payload = is_array($item['payload'] ?? null) ? $item['payload'] : [];
            $attrs = [
                'tenant_id' => $tid,
                'profile_id' => $profile->id,
                'type' => $item['type'],
                'sort' => (int) ($item['sort'] ?? $i),
                'is_visible' => (bool) ($item['is_visible'] ?? true),
                'payload' => $payload,
            ];

            $id = isset($item['id']) ? (int) $item['id'] : 0;
            if ($id > 0) {
                $block = LinkHubBlock::query()
                    ->where('tenant_id', $tid)
                    ->where('profile_id', $profile->id)
                    ->where('id', $id)
                    ->first();
                if ($block) {
                    $block->update($attrs);
                    $keepIds[] = $block->id;
                    continue;
                }
            }

            $block = LinkHubBlock::query()->create($attrs);
            $keepIds[] = $block->id;
        }

        LinkHubBlock::query()
            ->where('tenant_id', $tid)
            ->where('profile_id', $profile->id)
            ->when($keepIds !== [], fn ($q) => $q->whereNotIn('id', $keepIds), fn ($q) => $q)
            ->delete();

        return response()->json(['data' => $profile->fresh()->load('blocks')]);
    }

    protected function ensureBusiness(int $tenantId): LinkHubProfile
    {
        return LinkHubProfile::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'kind' => LinkHubProfile::KIND_BUSINESS],
            [
                'slug' => null,
                'title' => '',
                'is_published' => true,
                'theme_json' => [],
                'sort' => 0,
            ]
        );
    }

    protected function assertOwned(Request $request, LinkHubProfile $profile): void
    {
        abort_unless((int) $profile->tenant_id === (int) $request->user()->tenant_id, 404);
    }

    /** @return list<string> */
    protected function reservedSlugs(): array
    {
        return [
            'admin', 'dashboard', 'login', 'setup', 'api', 'account', 'link-hub',
            'blog', 'shop', 'cart', 'checkout', 'media', '_next', 'favicon',
        ];
    }
}
