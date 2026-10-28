<?php

namespace App\Http\Controllers\Api\V1\Poetry;

use App\Http\Controllers\Controller;
use App\Models\MediaAsset;
use App\Models\Poetry\PoetryMedia;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;
use App\Services\Poetry\PoetryPresenter;
use App\Services\Poetry\PoetryScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Admin CRUD for standalone poetry audio/video (title, kind, file or link, cover, occasion, optional poem). */
class PoetryMediaAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = PoetryMedia::query()->with(['asset', 'occasion', 'poem'])->orderBy('sort')->orderByDesc('id');
        if ($s = trim((string) $request->query('q', ''))) {
            $q->where('title', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $s).'%');
        }
        if (in_array($request->query('kind'), PoetryMedia::KINDS, true)) {
            $q->where('kind', $request->query('kind'));
        }
        $page = $q->paginate(min(100, max(1, (int) $request->query('per_page', 50))));

        return response()->json(['data' => collect($page->items())->map(fn ($m) => PoetryPresenter::media($m))->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function store(Request $request): JsonResponse
    {
        $m = $this->save(new PoetryMedia, $request);

        return response()->json(['data' => PoetryPresenter::media($m->load(['asset', 'occasion', 'poem']))], 201);
    }

    public function update(Request $request, int $media): JsonResponse
    {
        $m = $this->save(PoetryMedia::query()->findOrFail($media), $request);

        return response()->json(['data' => PoetryPresenter::media($m->load(['asset', 'occasion', 'poem']))]);
    }

    public function destroy(int $media): JsonResponse
    {
        PoetryMedia::query()->findOrFail($media)->delete();

        return response()->json(['ok' => true]);
    }

    private function save(PoetryMedia $m, Request $request): PoetryMedia
    {
        $tid = PoetryScope::id();
        $req = $m->exists ? 'sometimes' : 'required';
        $url = ['nullable', 'string', 'max:1024', 'regex:#^(https?://|/)#i'];
        $data = $request->validate([
            'title' => [$req, 'string', 'max:255'],
            'kind' => [$req, Rule::in(PoetryMedia::KINDS)],
            'media_id' => ['nullable', 'integer'],
            'file_url' => $url,
            'external_url' => ['nullable', 'string', 'max:1024', 'regex:#^https?://#i'],
            'cover' => $url,
            'occasion_id' => ['nullable', 'integer'],
            'poem_id' => ['nullable', 'integer'],
            'reciter' => ['nullable', 'string', 'max:160'],
            'duration' => ['nullable', 'string', 'max:16'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'status' => ['nullable', Rule::in(['draft', 'published'])],
        ]);
        // Cross-tenant ids are rejected (PoetryTerm/PoetryPoem are tenant-scoped; media_assets checked explicitly).
        if (! empty($data['occasion_id']) && ! PoetryTerm::query()->where('kind', 'occasion')->whereKey($data['occasion_id'])->exists()) {
            throw ValidationException::withMessages(['occasion_id' => 'مناسبت نامعتبر است.']);
        }
        if (! empty($data['poem_id']) && ! PoetryPoem::query()->whereKey($data['poem_id'])->exists()) {
            throw ValidationException::withMessages(['poem_id' => 'شعر مرتبط نامعتبر است.']);
        }
        if (! empty($data['media_id']) && ! MediaAsset::query()->where('tenant_id', $tid)->whereKey($data['media_id'])->exists()) {
            throw ValidationException::withMessages(['media_id' => 'فایل نامعتبر است.']);
        }
        if (array_key_exists('status', $data) && $data['status'] === null) {
            unset($data['status']);
        }
        $m->fill(array_map(fn ($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v, $data) + ($m->exists ? [] : ['status' => 'published']));
        $hasFile = $m->media_id || $m->file_url || $m->external_url;
        if (! $hasFile) {
            throw ValidationException::withMessages(['file_url' => 'یک فایل بارگذاری کنید یا پیوند ایتا/آپارات وارد کنید.']);
        }
        $m->save();

        return $m;
    }
}
