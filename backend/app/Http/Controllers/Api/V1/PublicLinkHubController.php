<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\LinkHubBlock;
use App\Models\LinkHubFormSubmission;
use App\Models\LinkHubProfile;
use App\Services\LinkHub\LinkHubAliasService;
use App\Services\LinkHub\LinkHubAnalytics;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class PublicLinkHubController extends Controller
{
    use ResolvesPublicTenant;

    public function page(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $slug = trim((string) $request->query('slug', ''));
        $slug = $slug === '' ? null : strtolower($slug);

        $query = LinkHubProfile::query()
            ->where('tenant_id', $tenant->id)
            ->where('is_published', true);

        if ($slug === null) {
            $profile = (clone $query)->where('kind', LinkHubProfile::KIND_BUSINESS)->first();
        } else {
            $profile = (clone $query)
                ->where('kind', LinkHubProfile::KIND_MEMBER)
                ->where('slug', $slug)
                ->first();
        }

        if (! $profile) {
            return response()->json(['message' => 'صفحه یافت نشد.'], 404);
        }

        $blocks = $profile->blocks()
            ->where('is_visible', true)
            ->orderBy('sort')
            ->get()
            ->map(fn (LinkHubBlock $b) => [
                'id' => $b->id,
                'type' => $b->type,
                'payload' => $this->publicPayload($b),
            ]);

        $host = $this->requestHost($request);
        $isAlias = $tenant->isLinkHubHost($host);

        return response()->json([
            'data' => [
                'profile' => [
                    'id' => $profile->id,
                    'kind' => $profile->kind,
                    'slug' => $profile->slug,
                    'title' => $profile->title ?: ($tenant->store_display_name ?: $tenant->name),
                    'avatar_url' => $profile->avatar_url,
                    'bio' => $profile->bio,
                    'theme_json' => $profile->theme_json ?? [],
                ],
                'blocks' => $blocks,
                'tenant' => [
                    'name' => $tenant->store_display_name ?: $tenant->name,
                    'domain' => $tenant->domain,
                ],
                'host_mode' => $isAlias ? 'link-hub' : 'primary',
                'alias_hostname' => LinkHubAliasService::hostnameFor($tenant),
            ],
        ])->header('Cache-Control', 'public, max-age=30, s-maxage=60');
    }

    public function hostMode(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $host = $this->requestHost($request);
        $isAlias = $tenant->isLinkHubHost($host);

        return response()->json([
            'data' => [
                'host_mode' => $isAlias ? 'link-hub' : 'primary',
                'host' => $host,
                'alias_hostname' => LinkHubAliasService::hostnameFor($tenant),
                'alias_subdomain' => LinkHubAliasService::normalizeLabel($tenant->alias_subdomain ?? 'contact'),
                'domain_aliases' => $tenant->normalizedDomainAliases(),
            ],
        ])->header('Cache-Control', 'public, max-age=60');
    }

    public function submitForm(Request $request, int $blockId): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $block = LinkHubBlock::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $blockId)
            ->where('type', 'form')
            ->where('is_visible', true)
            ->first();

        if (! $block) {
            return response()->json(['message' => 'فرم یافت نشد.'], 404);
        }

        $key = 'linkhub-form:'.$tenant->id.':'.$block->id.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 8)) {
            return response()->json(['message' => 'تعداد درخواست زیاد است. کمی بعد دوباره تلاش کنید.'], 429);
        }
        RateLimiter::hit($key, 60);

        $data = $request->validate([
            'fields' => 'required|array|max:40',
            'fields.*' => 'nullable|string|max:2000',
        ]);
        $payload = is_array($block->payload) ? $block->payload : [];
        $defs = is_array($payload['fields'] ?? null) ? $payload['fields'] : [
            ['name' => 'name', 'required' => true], ['name' => 'phone', 'required' => true], ['name' => 'message', 'required' => false],
        ];
        $known = [];
        foreach ($defs as $def) {
            $name = is_array($def) ? (string) ($def['name'] ?? '') : '';
            if ($name === '') {
                continue;
            }
            $known[] = $name;
            if (! empty($def['required']) && trim((string) ($data['fields'][$name] ?? '')) === '') {
                return response()->json(['message' => __('validation.required', ['attribute' => (string) ($def['label'] ?? $name)]), 'errors' => ['fields.'.$name => ['required']]], 422);
            }
        }
        // Keep only the fields the block defines.
        $data['fields'] = array_intersect_key($data['fields'], array_flip($known));

        $submission = LinkHubFormSubmission::query()->create([
            'tenant_id' => $tenant->id,
            'profile_id' => $block->profile_id,
            'block_id' => $block->id,
            'payload' => $data['fields'],
            'ip_hash' => hash('sha256', (string) $request->ip()),
        ]);

        return response()->json(['data' => ['ok' => true, 'id' => $submission->id]], 201);
    }

    public function recordView(Request $request, LinkHubAnalytics $analytics): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $profile = $this->resolvePublishedProfile($tenant->id, $request->input('slug'));
        if (! $profile) {
            return response()->json(['message' => 'صفحه یافت نشد.'], 404);
        }

        $ok = $analytics->recordView($request, $profile);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function recordClick(Request $request, LinkHubAnalytics $analytics): \Illuminate\Http\JsonResponse
    {
        $tenant = $this->publicTenant($request);
        $data = $request->validate([
            'slug' => 'nullable|string|max:64',
            'block_id' => 'nullable|integer',
            'target' => 'nullable|string|max:500',
        ]);

        $profile = $this->resolvePublishedProfile($tenant->id, $data['slug'] ?? null);
        if (! $profile) {
            return response()->json(['message' => 'صفحه یافت نشد.'], 404);
        }

        $blockId = isset($data['block_id']) ? (int) $data['block_id'] : null;
        if ($blockId) {
            $owned = LinkHubBlock::query()
                ->where('tenant_id', $tenant->id)
                ->where('profile_id', $profile->id)
                ->where('id', $blockId)
                ->exists();
            if (! $owned) {
                $blockId = null;
            }
        }

        $ok = $analytics->recordClick($request, $profile, $blockId, $data['target'] ?? null);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    protected function resolvePublishedProfile(int $tenantId, mixed $slug): ?LinkHubProfile
    {
        $slug = is_string($slug) ? trim($slug) : '';
        $slug = $slug === '' ? null : strtolower($slug);

        $query = LinkHubProfile::query()
            ->where('tenant_id', $tenantId)
            ->where('is_published', true);

        if ($slug === null) {
            return (clone $query)->where('kind', LinkHubProfile::KIND_BUSINESS)->first();
        }

        return (clone $query)
            ->where('kind', LinkHubProfile::KIND_MEMBER)
            ->where('slug', $slug)
            ->first();
    }

    /** @return array<string, mixed> */
    protected function publicPayload(LinkHubBlock $block): array
    {
        $payload = is_array($block->payload) ? $block->payload : [];

        return match ($block->type) {
            'form' => [
                'title' => $payload['title'] ?? 'فرم',
                'submit_label' => $payload['submit_label'] ?? 'ارسال',
                'fields' => is_array($payload['fields'] ?? null) ? $payload['fields'] : [
                    ['name' => 'name', 'label' => 'نام', 'type' => 'text', 'required' => true],
                    ['name' => 'phone', 'label' => 'موبایل', 'type' => 'tel', 'required' => true],
                    ['name' => 'message', 'label' => 'پیام', 'type' => 'textarea', 'required' => false],
                ],
            ],
            default => $payload,
        };
    }

    protected function requestHost(Request $request): string
    {
        $header = (string) ($request->header('X-Tenant-Domain') ?: $request->query('tenant_domain', ''));
        if ($header !== '') {
            return LinkHubAliasService::normalizeHost($header);
        }

        return LinkHubAliasService::normalizeHost($request->getHost());
    }
}
