<?php

namespace App\Http\Controllers\Api\V1\Poetry;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Services\Poetry\PoetryImportParser;
use App\Services\Poetry\PoetryPresenter;
use App\Services\Poetry\PoetryScope;

class PoetryAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = PoetryPoem::query()->with(['terms', 'occasion', 'meter'])->orderByDesc('id');
        if ($s = trim((string) $request->query('q', ''))) {
            $q->where('title', 'like', '%'.$s.'%');
        }
        if (in_array($request->query('status'), ['draft', 'published'], true)) {
            $q->where('status', $request->query('status'));
        }
        $page = $q->paginate(30);

        return response()->json(['data' => collect($page->items())->map(fn ($p) => PoetryPresenter::card($p) + ['status' => $p->status])->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function show(int|PoetryPoem $poem): JsonResponse
    {
        $poem = $poem instanceof PoetryPoem ? $poem : PoetryPoem::query()->findOrFail($poem);
        $poem->load(['stanzas', 'terms', 'occasion', 'meter']);

        return response()->json(['data' => PoetryPresenter::full($poem) + ['status' => $poem->status, 'media_ids' => $poem->media_ids ?? [], 'term_ids' => $poem->terms->pluck('id')->all()]]);
    }

    public function store(Request $request): JsonResponse
    {
        $poem = DB::transaction(fn () => $this->save(new PoetryPoem, $request));

        return $this->show($poem)->setStatusCode(201);
    }

    public function update(Request $request, int $poem): JsonResponse
    {
        $poem = PoetryPoem::query()->findOrFail($poem);
        DB::transaction(fn () => $this->save($poem, $request));

        return $this->show($poem->fresh());
    }

    public function destroy(int|PoetryPoem $poem): JsonResponse
    {
        $poem = $poem instanceof PoetryPoem ? $poem : PoetryPoem::query()->findOrFail($poem);
        $poem->delete();

        return response()->json(['ok' => true]);
    }

    public function parse(Request $request, PoetryImportParser $parser): JsonResponse
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:60000']]);

        return response()->json(['data' => $parser->parse($data['text'])]);
    }

    public function terms(Request $request): JsonResponse
    {
        $q = PoetryTerm::query()->withCount('poems')->orderBy('kind')->orderBy('sort');
        if (in_array($request->query('kind'), PoetryTerm::KINDS, true)) {
            $q->where('kind', $request->query('kind'));
        }

        return response()->json(['data' => $q->get()]);
    }

    public function storeTerm(Request $request): JsonResponse
    {
        $data = $this->termData($request);

        return response()->json(['data' => PoetryTerm::query()->create($data)], 201);
    }

    public function updateTerm(Request $request, int $term): JsonResponse
    {
        $term = PoetryTerm::query()->findOrFail($term);
        $term->update($this->termData($request, $term));

        return response()->json(['data' => $term->fresh()]);
    }

    public function destroyTerm(int|PoetryTerm $term): JsonResponse
    {
        $term = $term instanceof PoetryTerm ? $term : PoetryTerm::query()->findOrFail($term);
        $term->delete();

        return response()->json(['ok' => true]);
    }

    private function termData(Request $request, ?PoetryTerm $term = null): array
    {
        $data = $request->validate([
            'kind' => [$term ? 'sometimes' : 'required', Rule::in(PoetryTerm::KINDS)],
            'name' => [$term ? 'sometimes' : 'required', 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[\pL\pN\-]+$/u'],
            'description' => ['nullable', 'string', 'max:5000'],
            'image' => ['nullable', 'string', 'max:512'],
            'sort' => ['nullable', 'integer', 'min:0'],
        ]);
        $kind = $data['kind'] ?? $term?->kind;
        $data['slug'] = $data['slug'] ?? ($term?->slug ?? $this->slug($data['name']));
        $dup = PoetryTerm::query()->where('kind', $kind)->where('slug', $data['slug'])->when($term, fn ($q) => $q->where('id', '!=', $term->id))->exists();
        abort_if($dup, 422, 'نامک تکراری است.');

        return $data;
    }

    private function save(PoetryPoem $poem, Request $request): PoetryPoem
    {
        $data = $request->validate([
            'title' => [$poem->exists ? 'sometimes' : 'required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:190', 'regex:/^[\pL\pN\-]+$/u', Rule::unique('poetry_poems', 'slug')->where('tenant_id', PoetryScope::id())->ignore($poem->id)],
            'excerpt' => ['nullable', 'string', 'max:2000'],
            'occasion_id' => ['nullable', 'integer', Rule::exists('poetry_terms', 'id')->where('tenant_id', PoetryScope::id())->where('kind', 'occasion')],
            'meter_id' => ['nullable', 'integer', Rule::exists('poetry_terms', 'id')->where('tenant_id', PoetryScope::id())->where('kind', 'meter')],
            'term_ids' => ['nullable', 'array'], 'term_ids.*' => ['integer', Rule::exists('poetry_terms', 'id')->where('tenant_id', PoetryScope::id())->whereIn('kind', ['figure', 'style'])],
            'style_label' => ['nullable', 'string', 'max:160'], 'pen_name' => ['nullable', 'string', 'max:80'],
            'composed_label' => ['nullable', 'string', 'max:80'], 'melody_credit' => ['nullable', 'string', 'max:255'],
            'flags' => ['nullable', 'array'], 'flags.is_new' => ['boolean'], 'flags.not_performed' => ['boolean'], 'flags.rewritten' => ['boolean'],
            'refrain_after_each' => ['boolean'],
            'media_ids' => ['nullable', 'array'], 'media_ids.*' => ['integer'],
            'external_links' => ['nullable', 'array', 'max:10'], 'external_links.*.label' => ['nullable', 'string', 'max:80'],
            'external_links.*.url' => ['required', 'string', 'max:512', 'regex:#^https?://#i'],
            'seo' => ['nullable', 'array'],
            'status' => ['nullable', Rule::in(['draft', 'published'])], 'published_at' => ['nullable', 'date'],
            'stanzas' => [$poem->exists ? 'sometimes' : 'required', 'array', 'max:200'],
            'stanzas.*.type' => ['required', Rule::in(['title', 'stanza', 'refrain'])],
            'stanzas.*.layout' => ['nullable', Rule::in(['couplet', 'single'])],
            'stanzas.*.repeat' => ['nullable', 'integer', 'min:1', 'max:20'],
            'stanzas.*.note' => ['nullable', 'string', 'max:255'],
            'stanzas.*.lines' => ['required', 'array', 'min:1', 'max:200'], 'stanzas.*.lines.*' => ['string', 'max:500'],
        ]);

        $fields = collect($data)->except(['stanzas', 'term_ids'])->all();
        if (! $poem->exists && empty($fields['slug'])) {
            $fields['slug'] = $this->uniquePoemSlug($data['title']);
        }
        if (($fields['status'] ?? null) === 'published' && empty($fields['published_at']) && ! $poem->published_at) {
            $fields['published_at'] = now();
        }
        $poem->fill($fields)->save();

        if (array_key_exists('term_ids', $data)) {
            $poem->terms()->sync($data['term_ids'] ?? []);
        }
        if (array_key_exists('stanzas', $data)) {
            $poem->stanzas()->delete();
            foreach (array_values($data['stanzas']) as $i => $s) {
                $poem->stanzas()->create(['position' => $i, 'type' => $s['type'], 'layout' => $s['layout'] ?? 'couplet', 'repeat' => $s['repeat'] ?? 1,
                    'note' => $s['note'] ?? null, 'lines' => array_values(array_map('trim', $s['lines']))]);
            }
        }
        $poem->refreshSearchText();

        return $poem;
    }

    private function slug(string $s): string
    {
        $slug = trim(preg_replace('/[^\pL\pN]+/u', '-', mb_strtolower($s)) ?? '', '-');

        return mb_substr($slug !== '' ? $slug : Str::random(8), 0, 100);
    }

    private function uniquePoemSlug(string $title): string
    {
        $base = $this->slug($title);
        $slug = $base;
        $i = 2;
        while (PoetryPoem::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
