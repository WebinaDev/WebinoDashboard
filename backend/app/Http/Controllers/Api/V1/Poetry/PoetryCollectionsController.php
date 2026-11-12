<?php

namespace App\Http\Controllers\Api\V1\Poetry;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\Poetry\PoetryBook;
use App\Models\Poetry\PoetryHighlight;
use App\Models\Poetry\PoetryMedia;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Services\Membership\MembershipService;
use App\Services\Poetry\PoetryPresenter;
use App\Services\Poetry\PoetryScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Poetry books (poem collections), highlights (story-like image or video items) and the occasions hub.
 * Admin CRUD + public reads. Premium items keep title and meta for visitors; text and links are dropped.
 */
class PoetryCollectionsController extends Controller
{
    // ---------- Books ----------

    public function adminBooks(Request $request): JsonResponse
    {
        $rows = PoetryBook::query()->withCount('poems')->orderBy('sort')->orderByDesc('id')->get();

        return response()->json(['data' => $rows->map(fn ($b) => self::bookRow($b) + ['status' => $b->status, 'sort' => (int) $b->sort])->all()]);
    }

    public function adminBook(int $book): JsonResponse
    {
        $b = PoetryBook::query()->with('poems')->withCount('poems')->findOrFail($book);

        return response()->json(['data' => self::bookRow($b) + ['status' => $b->status, 'sort' => (int) $b->sort, 'seo' => $b->seo ?? (object) [],
            'poem_ids' => $b->poems->pluck('id')->all(), 'poems' => $b->poems->map(fn ($p) => ['id' => $p->id, 'slug' => $p->slug, 'title' => $p->title])->all()]]);
    }

    public function storeBook(Request $request): JsonResponse
    {
        $b = DB::transaction(fn () => $this->saveBook(new PoetryBook, $request));

        return $this->adminBook($b->id)->setStatusCode(201);
    }

    public function updateBook(Request $request, int $book): JsonResponse
    {
        $b = DB::transaction(fn () => $this->saveBook(PoetryBook::query()->findOrFail($book), $request));

        return $this->adminBook($b->id);
    }

    public function destroyBook(int $book): JsonResponse
    {
        PoetryBook::query()->findOrFail($book)->delete();

        return response()->json(['ok' => true]);
    }

    private function saveBook(PoetryBook $b, Request $request): PoetryBook
    {
        $req = $b->exists ? 'sometimes' : 'required';
        $url = ['nullable', 'string', 'max:1024', 'regex:#^(https?://|/)#i'];
        $data = $request->validate([
            'title' => [$req, 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:190', 'regex:/^[\pL\pN\-]+$/u', Rule::unique('poetry_books', 'slug')->where('tenant_id', PoetryScope::id())->ignore($b->id)],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:20000'],
            'cover' => $url,
            'publisher' => ['nullable', 'string', 'max:160'],
            'published_label' => ['nullable', 'string', 'max:80'],
            'pages' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'isbn' => ['nullable', 'string', 'max:32'],
            'product_id' => ['nullable', 'integer', Rule::exists('products', 'id')->where('tenant_id', PoetryScope::id())],
            'purchase_url' => $url,
            'cta_label' => ['nullable', 'string', 'max:80'],
            'is_premium' => ['boolean'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'status' => ['nullable', Rule::in(['draft', 'published'])],
            'seo' => ['nullable', 'array'],
            'poem_ids' => ['nullable', 'array', 'max:1000'],
            'poem_ids.*' => ['integer'],
        ]);
        $ids = array_values(array_unique(array_map('intval', $data['poem_ids'] ?? [])));
        if ($ids && PoetryPoem::query()->whereIn('id', $ids)->count() !== count($ids)) {
            throw ValidationException::withMessages(['poem_ids' => 'یک یا چند شعر نامعتبر است.']);
        }
        $fields = collect($data)->except(['poem_ids'])->map(fn ($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v)->all();
        foreach (['status', 'sort'] as $k) {
            if (array_key_exists($k, $fields) && $fields[$k] === null) {
                unset($fields[$k]);
            }
        }
        if (! $b->exists && empty($fields['slug'])) {
            $fields['slug'] = $this->uniqueSlug((string) $data['title']);
        } elseif (array_key_exists('slug', $fields) && empty($fields['slug'])) {
            unset($fields['slug']);
        }
        $b->fill($fields)->save();
        if (array_key_exists('poem_ids', $data)) {
            $b->poems()->sync(collect($ids)->mapWithKeys(fn ($id, $i) => [$id => ['position' => $i]])->all());
        }

        return $b;
    }

    private function uniqueSlug(string $title): string
    {
        $base = mb_substr(trim(preg_replace('/[^\pL\pN]+/u', '-', mb_strtolower($title)) ?? '', '-') ?: Str::random(8), 0, 100);
        $slug = $base;
        $i = 2;
        while (PoetryBook::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    public function books(Request $request): JsonResponse
    {
        $rows = PoetryBook::query()->published()->withCount(['poems' => fn ($q) => $q->published()])->orderBy('sort')->orderByDesc('id')
            ->limit(min(60, max(1, (int) $request->query('limit', 24))))->get();
        $full = $this->full();

        return response()->json(['data' => $rows->map(fn ($b) => self::bookRow($b) + ['locked' => $b->is_premium && ! $full])->all()]);
    }

    public function book(string $slug): JsonResponse
    {
        $b = PoetryBook::query()->published()->withCount(['poems' => fn ($q) => $q->published()])->where('slug', $slug)->firstOrFail();
        $full = $this->full();
        $poems = $b->poems()->published()->with(['terms', 'occasion', 'meter'])->get();

        return response()->json(['data' => self::bookRow($b) + [
            'locked' => $b->is_premium && ! $full,
            'seo' => $b->seo ?? (object) [],
            // A premium book makes its poems premium for visitors.
            'poems' => $poems->map(function ($p) use ($b, $full) {
                $row = PoetryPresenter::card($p);
                $row['is_premium'] = $row['is_premium'] || $b->is_premium;

                return PoetryPresenter::lockPoem($row, $full);
            })->all(),
        ]]);
    }

    public static function bookRow(PoetryBook $b): array
    {
        return [
            'id' => $b->id, 'slug' => $b->slug, 'title' => $b->title, 'subtitle' => $b->subtitle, 'description' => $b->description,
            'cover' => $b->cover, 'publisher' => $b->publisher, 'published_label' => $b->published_label, 'pages' => $b->pages, 'isbn' => $b->isbn,
            'product_id' => $b->product_id, 'purchase_url' => $b->purchase_url, 'cta_label' => $b->cta_label,
            'is_premium' => (bool) $b->is_premium, 'poems_count' => (int) ($b->poems_count ?? 0),
        ];
    }

    // ---------- Highlights ----------

    public function adminHighlights(): JsonResponse
    {
        $rows = PoetryHighlight::query()->with('asset')->orderBy('sort')->orderByDesc('id')->get();

        return response()->json(['data' => $rows->map(fn ($h) => self::highlight($h) + ['status' => $h->status, 'sort' => (int) $h->sort,
            'media_id' => $h->media_id, 'file_url' => $h->file_url])->all()]);
    }

    public function storeHighlight(Request $request): JsonResponse
    {
        $h = $this->saveHighlight(new PoetryHighlight, $request);

        return response()->json(['data' => self::highlight($h->load('asset')) + ['status' => $h->status, 'sort' => (int) $h->sort]], 201);
    }

    public function updateHighlight(Request $request, int $highlight): JsonResponse
    {
        $h = $this->saveHighlight(PoetryHighlight::query()->findOrFail($highlight), $request);

        return response()->json(['data' => self::highlight($h->load('asset')) + ['status' => $h->status, 'sort' => (int) $h->sort]]);
    }

    public function destroyHighlight(int $highlight): JsonResponse
    {
        PoetryHighlight::query()->findOrFail($highlight)->delete();

        return response()->json(['ok' => true]);
    }

    private function saveHighlight(PoetryHighlight $h, Request $request): PoetryHighlight
    {
        $req = $h->exists ? 'sometimes' : 'required';
        $url = ['nullable', 'string', 'max:1024', 'regex:#^(https?://|/)#i'];
        $data = $request->validate([
            'title' => [$req, 'string', 'max:255'],
            'kind' => [$req, Rule::in(PoetryHighlight::KINDS)],
            'media_id' => ['nullable', 'integer'],
            'file_url' => $url,
            'external_url' => ['nullable', 'string', 'max:1024', 'regex:#^https?://#i'],
            'cover' => $url,
            'link_url' => $url,
            'link_label' => ['nullable', 'string', 'max:80'],
            'duration' => ['nullable', 'string', 'max:16'],
            'is_premium' => ['boolean'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'status' => ['nullable', Rule::in(['draft', 'published'])],
        ]);
        if (! empty($data['media_id']) && ! MediaAsset::query()->where('tenant_id', PoetryScope::id())->whereKey($data['media_id'])->exists()) {
            throw ValidationException::withMessages(['media_id' => 'فایل نامعتبر است.']);
        }
        foreach (['status', 'sort'] as $k) {
            if (array_key_exists($k, $data) && $data[$k] === null) {
                unset($data[$k]);
            }
        }
        $h->fill(array_map(fn ($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v, $data));
        if (! $h->media_id && ! $h->file_url && ! $h->external_url && ! $h->cover) {
            throw ValidationException::withMessages(['file_url' => 'یک تصویر یا ویدیو بارگذاری کنید یا پیوند وارد کنید.']);
        }
        $h->save();

        return $h;
    }

    public function highlights(Request $request): JsonResponse
    {
        $rows = PoetryHighlight::query()->published()->with('asset')->orderBy('sort')->orderByDesc('id')
            ->limit(min(60, max(1, (int) $request->query('limit', 30))))->get();
        $full = $this->full();

        return response()->json(['data' => $rows->map(fn ($h) => PoetryPresenter::lockMedia(self::highlight($h), $full))
            ->filter(fn ($r) => $r['locked'] || $r['url'] || $r['external_url'] || $r['cover'])->values()->all()]);
    }

    public static function highlight(PoetryHighlight $h): array
    {
        $file = trim((string) $h->file_url);
        if ($file === '' && $h->relationLoaded('asset') && $h->asset && (int) $h->asset->tenant_id === (int) $h->tenant_id) {
            $file = (string) $h->asset->url;
        }
        $file = $file !== '' && (PoetryPresenter::safeUrl($file) || str_starts_with($file, '/')) ? $file : null;
        $ext = trim((string) $h->external_url);
        $ext = $ext !== '' && PoetryPresenter::safeUrl($ext) ? $ext : null;

        return [
            'id' => $h->id, 'title' => $h->title, 'kind' => in_array($h->kind, PoetryHighlight::KINDS, true) ? $h->kind : 'image',
            'url' => $file, 'external_url' => $ext, 'embed_url' => $ext ? PoetryPresenter::embedUrl($ext) : null,
            'cover' => $h->cover ?: ($h->kind === 'image' ? $file : null), 'link_url' => $h->link_url, 'link_label' => $h->link_label,
            'duration' => $h->duration, 'is_premium' => (bool) $h->is_premium,
        ];
    }

    // ---------- Occasions hub ----------

    public function occasions(): JsonResponse
    {
        $poems = PoetryPoem::query()->published()->whereNotNull('occasion_id')->selectRaw('occasion_id as k, count(*) as c')->groupBy('occasion_id')->pluck('c', 'k');
        $media = PoetryMedia::query()->published()->playable()->whereNotNull('occasion_id')->selectRaw('occasion_id as k, count(*) as c')->groupBy('occasion_id')->pluck('c', 'k');
        $terms = PoetryTerm::query()->where('kind', 'occasion')->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => $terms->map(fn ($t) => PoetryPresenter::term($t) + [
            'poems_count' => (int) ($poems[$t->id] ?? 0), 'media_count' => (int) ($media[$t->id] ?? 0),
        ])->all()]);
    }

    public function occasion(Request $request, string $slug): JsonResponse
    {
        $term = PoetryTerm::query()->where('kind', 'occasion')->where('slug', $slug)->firstOrFail();
        $full = $this->full();
        $page = PoetryPoem::query()->published()->with(['terms', 'occasion', 'meter'])->where('occasion_id', $term->id)
            ->orderByDesc('published_at')->orderByDesc('id')->paginate(min(48, max(1, (int) $request->query('per_page', 12))));
        $media = PoetryMedia::query()->published()->playable()->with(['asset', 'occasion'])->where('occasion_id', $term->id)->orderBy('sort')->orderByDesc('id')->limit(24)->get();
        $public = ['id', 'title', 'kind', 'url', 'external_url', 'embed_url', 'cover', 'reciter', 'duration', 'occasion', 'is_premium'];

        return response()->json([
            'data' => [
                'occasion' => PoetryPresenter::term($term),
                'poems' => collect($page->items())->map(fn ($p) => PoetryPresenter::lockPoem(PoetryPresenter::card($p), $full))->all(),
                'media' => $media->map(fn ($m) => PoetryPresenter::lockMedia(array_intersect_key(PoetryPresenter::media($m), array_flip($public)), $full))->values()->all(),
            ],
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    private function full(): bool
    {
        $req = request();
        if (! $req->attributes->has('poetry_full_access')) {
            $req->attributes->set('poetry_full_access', app(MembershipService::class)->hasFullAccess((int) PoetryScope::id(), auth('sanctum')->user()));
        }

        return (bool) $req->attributes->get('poetry_full_access');
    }
}
