<?php

namespace App\Http\Controllers\Api\V1\Poetry;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\Poetry\PoetryMedia;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Services\Poetry\PoetryPresenter;
use App\Services\Poetry\PoetryText;

class PublicPoetryController extends Controller
{
    public function terms(Request $request): JsonResponse
    {
        $q = PoetryTerm::query()->orderBy('kind')->orderBy('sort')->orderBy('id');
        if (in_array($request->query('kind'), PoetryTerm::KINDS, true)) {
            $q->where('kind', $request->query('kind'));
        }

        // Facet counts: figure/style via the pivot, occasion/meter via their foreign keys (published poems only).
        $q->withCount(['poems as poems_count' => fn ($w) => $w->published()]);
        $byFk = fn (string $col) => PoetryPoem::query()->published()->whereNotNull($col)
            ->selectRaw($col.' as k, count(*) as c')->groupBy($col)->pluck('c', 'k');
        $occ = $byFk('occasion_id');
        $met = $byFk('meter_id');

        return response()->json(['data' => $q->get()->map(fn ($t) => PoetryPresenter::term($t) + [
            'count' => (int) match ($t->kind) { 'occasion' => $occ[$t->id] ?? 0, 'meter' => $met[$t->id] ?? 0, default => $t->poems_count ?? 0 },
        ])->all()]);
    }

    public function index(Request $request): JsonResponse
    {
        $q = $this->filtered($request);
        $sort = $request->query('sort');
        $sort === 'popular' ? $q->orderByDesc('view_count') : $q->orderByDesc('published_at')->orderByDesc('id');
        $page = $q->paginate(min(48, max(1, (int) $request->query('per_page', 12))));

        return response()->json([
            'data' => collect($page->items())->map(fn ($p) => PoetryPresenter::card($p))->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function popular(Request $request): JsonResponse
    {
        $items = PoetryPoem::query()->published()->with(['terms', 'occasion', 'meter'])->orderByDesc('view_count')->limit(min(24, max(1, (int) $request->query('limit', 8))))->get();

        return response()->json(['data' => $items->map(fn ($p) => PoetryPresenter::card($p))->all()]);
    }

    public function show(string $slug): JsonResponse
    {
        $poem = $this->find($slug);
        DB::table('poetry_poems')->where('id', $poem->id)->increment('view_count');
        $poem->view_count++;
        $data = PoetryPresenter::full($poem);
        $data['related'] = $this->related($poem)->map(fn ($p) => PoetryPresenter::card($p))->all();

        return response()->json(['data' => $data]);
    }

    /** Standalone audio/video (poem optional). Only published items with a file or a link. */
    public function media(Request $request): JsonResponse
    {
        $q = PoetryMedia::query()->published()->playable()->with(['asset', 'occasion', 'poem' => fn ($w) => $w->published()]);
        if (in_array($request->query('kind'), PoetryMedia::KINDS, true)) {
            $q->where('kind', $request->query('kind'));
        }
        if ($occ = $request->query('occasion')) {
            $q->whereHas('occasion', fn ($w) => $w->where('slug', $occ));
        }
        $request->query('sort') === 'popular' ? $q->orderByDesc('play_count') : $q->orderBy('sort')->orderByDesc('id');
        $items = $q->limit(min(60, max(1, (int) $request->query('limit', 24))))->get();
        $public = ['id', 'title', 'kind', 'url', 'external_url', 'embed_url', 'cover', 'reciter', 'duration', 'occasion', 'poem'];

        return response()->json(['data' => $items->map(fn ($m) => array_intersect_key(PoetryPresenter::media($m), array_flip($public)))
            ->filter(fn ($r) => $r['url'] || $r['external_url'])->values()->all()]);
    }

    public function text(string $slug)
    {
        $poem = $this->find($slug);
        $name = (Str::slug($poem->slug) ?: 'poem').'.txt';

        return response(PoetryText::plain($poem), 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$name.'"',
        ]);
    }

    public function figure(Request $request, string $slug): JsonResponse
    {
        $term = PoetryTerm::query()->where('kind', 'figure')->where('slug', $slug)->firstOrFail();
        $request->merge(['figure' => $slug]);
        $page = $this->filtered($request)->orderByDesc('published_at')->orderByDesc('id')->paginate(min(48, max(1, (int) $request->query('per_page', 12))));

        return response()->json([
            'data' => ['figure' => PoetryPresenter::term($term), 'poems' => collect($page->items())->map(fn ($p) => PoetryPresenter::card($p))->all()],
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    private function filtered(Request $request)
    {
        $q = PoetryPoem::query()->published()->with(['terms', 'occasion', 'meter'])
            ->withExists(['mediaItems as media_items_exists' => fn ($m) => $m->published()->playable()]);
        $text = trim((string) $request->query('q', ''));
        if ($text !== '') {
            $needle = '%'.str_replace(['%', '_'], ['\%', '\_'], PoetryText::normalize(mb_substr($text, 0, 120))).'%';
            $q->where('search_text', 'like', $needle);
        }
        if ($occ = $request->query('occasion')) {
            $q->whereHas('occasion', fn ($w) => $w->where('slug', $occ));
        }
        if ($meter = $request->query('meter')) {
            $q->whereHas('meter', fn ($w) => $w->where('slug', $meter));
        }
        if ($request->boolean('has_media')) {
            $txt = fn (string $c) => DB::connection()->getDriverName() === 'mysql' ? "CAST($c AS CHAR)" : "CAST($c AS TEXT)";
            $q->where(fn ($w) => $w->whereRaw($txt('media_ids')." NOT IN ('[]','null')")
                ->orWhereRaw($txt('external_links')." NOT IN ('[]','null')")
                ->orWhereHas('mediaItems', fn ($m) => $m->published()->playable()));
        }
        if (in_array($flag = $request->query('flag'), ['is_new', 'not_performed', 'rewritten'], true)) {
            $q->where('flags->'.$flag, true);
        }
        foreach (['figure', 'style'] as $kind) {
            if ($slug = $request->query($kind)) {
                $q->whereHas('terms', fn ($w) => $w->where('kind', $kind)->where('slug', $slug));
            }
        }

        return $q;
    }

    private function find(string $slug): PoetryPoem
    {
        return PoetryPoem::query()->published()->with(['stanzas', 'terms', 'occasion', 'meter'])->where('slug', $slug)->firstOrFail();
    }

    private function related(PoetryPoem $poem)
    {
        $termIds = $poem->terms->pluck('id')->all();

        return PoetryPoem::query()->published()->with(['terms', 'occasion', 'meter'])->where('id', '!=', $poem->id)
            ->where(function ($w) use ($termIds, $poem) {
                $w->whereHas('terms', fn ($t) => $t->whereIn('poetry_terms.id', $termIds ?: [0]));
                if ($poem->occasion_id) {
                    $w->orWhere('occasion_id', $poem->occasion_id);
                }
            })
            ->orderByDesc('view_count')->limit(6)->get();
    }
}
