<?php

namespace App\Services\LinkHub;

use App\Models\LinkHubEvent;
use App\Models\LinkHubProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

final class LinkHubAnalytics
{
    public function visitorHash(Request $request): string
    {
        $ua = (string) $request->userAgent();

        return hash('sha256', $request->ip().'|'.$ua);
    }

    public function recordView(Request $request, LinkHubProfile $profile): bool
    {
        $key = 'linkhub-view:'.$profile->tenant_id.':'.$profile->id.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 20)) {
            return false;
        }
        RateLimiter::hit($key, 60);

        LinkHubEvent::query()->create([
            'tenant_id' => $profile->tenant_id,
            'profile_id' => $profile->id,
            'block_id' => null,
            'kind' => LinkHubEvent::KIND_VIEW,
            'visitor_hash' => $this->visitorHash($request),
            'target' => null,
            'created_at' => now(),
        ]);

        return true;
    }

    public function recordClick(
        Request $request,
        LinkHubProfile $profile,
        ?int $blockId,
        ?string $target
    ): bool {
        $key = 'linkhub-click:'.$profile->tenant_id.':'.$profile->id.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 60)) {
            return false;
        }
        RateLimiter::hit($key, 60);

        LinkHubEvent::query()->create([
            'tenant_id' => $profile->tenant_id,
            'profile_id' => $profile->id,
            'block_id' => $blockId,
            'kind' => LinkHubEvent::KIND_CLICK,
            'visitor_hash' => $this->visitorHash($request),
            'target' => $target ? mb_substr($target, 0, 500) : null,
            'created_at' => now(),
        ]);

        return true;
    }

    /**
     * @return array{views:int,visitors:int,clicks:int,ctr:float,days:int}
     */
    public function summary(int $tenantId, ?int $profileId = null, int $days = 30): array
    {
        $from = now()->subDays(max(1, $days))->startOfDay();

        $base = LinkHubEvent::query()
            ->where('tenant_id', $tenantId)
            ->where('created_at', '>=', $from);

        if ($profileId) {
            $base->where('profile_id', $profileId);
        }

        $views = (clone $base)->where('kind', LinkHubEvent::KIND_VIEW)->count();
        $clicks = (clone $base)->where('kind', LinkHubEvent::KIND_CLICK)->count();
        $visitors = (int) (clone $base)
            ->where('kind', LinkHubEvent::KIND_VIEW)
            ->whereNotNull('visitor_hash')
            ->select(DB::raw('count(distinct visitor_hash) as c'))
            ->value('c');

        $ctr = $views > 0 ? round(($clicks / $views) * 100, 1) : 0.0;

        return [
            'views' => $views,
            'visitors' => $visitors,
            'clicks' => $clicks,
            'ctr' => $ctr,
            'days' => $days,
        ];
    }
}
