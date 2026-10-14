<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\LinkHubBlock;
use App\Models\LinkHubFormSubmission;
use App\Models\LinkHubProfile;
use App\Services\LinkHub\LinkHubAliasService;
use App\Services\LinkHub\LinkHubAnalytics;
use App\Services\LinkHub\LinkHubBlockPresenter;
use App\Services\LinkHub\LinkHubTheme;
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
            ])
            ->filter(fn (array $row) => $row['payload'] !== null)
            ->values();

        $theme = LinkHubTheme::normalize($profile->theme_json ?? []);
        $title = $profile->title ?: ($tenant->store_display_name ?: $tenant->name);
        $bio = trim((string) $profile->bio);

        $host = $this->requestHost($request);
        $isAlias = $tenant->isLinkHubHost($host);

        return response()->json([
            'data' => [
                'profile' => [
                    'id' => $profile->id,
                    'kind' => $profile->kind,
                    'slug' => $profile->slug,
                    'title' => $title,
                    'avatar_url' => $profile->avatar_url,
                    'bio' => $profile->bio,
                    'theme_json' => $theme,
                ],
                'seo' => [
                    'title' => $title,
                    'description' => $bio !== '' ? mb_substr(preg_replace('/\s+/u', ' ', $bio), 0, 160) : ($theme['headline'] ?? null),
                    'image' => LinkHubTheme::safeImage($profile->avatar_url),
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
        ]);

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

    /** @return array<string, mixed>|null */
    protected function publicPayload(LinkHubBlock $block): ?array
    {
        return app(LinkHubBlockPresenter::class)->present($block);
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
