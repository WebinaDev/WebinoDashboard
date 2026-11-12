<?php

namespace App\Http\Controllers\Api\V1\Membership;

use App\Http\Controllers\Controller;
use App\Models\Membership\MembershipPlan;
use App\Models\Poetry\PoetryMedia;
use App\Services\Membership\MembershipPresenter;
use App\Services\Membership\MembershipService;
use App\Services\Poetry\PoetryPresenter;
use App\Services\Poetry\PoetryScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Public plans and comparison table; account membership status; media download with quota. */
class PublicMembershipController extends Controller
{
    public function __construct(protected MembershipService $membership) {}

    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('public_tenant_id');
        abort_if($tid <= 0, 404);
        $cfg = $this->membership->settings($tid);
        $plans = MembershipPlan::query()->with('product')->where('tenant_id', $tid)->where('is_active', true)->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => [
            'enabled' => (bool) $cfg['enabled'],
            'plans' => $cfg['enabled'] ? $plans->map(fn ($p) => MembershipPresenter::plan($p))->all() : [],
            'features' => $cfg['features'],
            'discount_percent' => (float) $cfg['discount_percent'],
            'downloads' => ['free_audio' => $cfg['downloads']['free_audio'], 'free_video' => $cfg['downloads']['free_video'], 'period' => $cfg['downloads']['period']],
        ]]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => $this->membership->status((int) $user->tenant_id, $user)]);
    }

    /**
     * Download one audio/video item. Premium members (and staff) download everything; normal users
     * spend the free quota (the same item again is free). Locked premium items need membership.
     * Local files are sent as an attachment; external links come back as JSON {url}.
     */
    public function download(Request $request, int $media)
    {
        $user = $request->user();
        $tid = (int) $user->tenant_id;
        $m = PoetryMedia::query()->published()->playable()->with('asset')->findOrFail($media);
        $full = $this->membership->hasFullAccess($tid, $user);
        if ($m->is_premium && ! $full) {
            return response()->json(['message' => __('membership.premium_required'), 'data' => ['code' => 'premium_required']], 403);
        }
        $kind = in_array($m->kind, PoetryMedia::KINDS, true) ? $m->kind : 'audio';
        $res = $this->membership->consumeDownload($tid, $user, $m->id, $kind);
        if (! $res['allowed']) {
            return response()->json(['message' => __('membership.download_quota_exceeded'), 'data' => ['code' => 'download_quota_exceeded', 'remaining' => 0]], 403);
        }
        $row = PoetryPresenter::media($m);
        $name = trim((string) preg_replace('/[^\pL\pN]+/u', '-', (string) $m->title), '-') ?: $kind.'-'.$m->id;
        [$disk, $path] = $this->localFile($m, (string) $row['url']);
        if ($disk && $request->query('mode') !== 'json') {
            $ext = pathinfo($path, PATHINFO_EXTENSION);

            return Storage::disk($disk)->download($path, $name.($ext ? '.'.$ext : ''), ['X-Downloads-Remaining' => $res['remaining'] === null ? 'unlimited' : (string) $res['remaining']]);
        }

        return response()->json(['data' => ['url' => $row['url'] ?: $row['external_url'], 'filename' => $name, 'remaining' => $res['remaining']]]);
    }

    /** @return array{0: ?string, 1: string} */
    private function localFile(PoetryMedia $m, string $url): array
    {
        $asset = $m->asset && (int) $m->asset->tenant_id === (int) PoetryScope::id() ? $m->asset : null;
        if (! trim((string) $m->file_url) && $asset && $asset->path) {
            $disk = $asset->disk === 'local' ? 'public' : ($asset->disk ?: 'public');
            if (Storage::disk($disk)->exists($asset->path)) {
                return [$disk, $asset->path];
            }
        }
        if (str_starts_with($url, '/storage/')) {
            $path = ltrim(rawurldecode(substr($url, strlen('/storage/'))), '/');
            if (! str_contains($path, '..') && Storage::disk('public')->exists($path)) {
                return ['public', $path];
            }
        }

        return [null, ''];
    }
}
