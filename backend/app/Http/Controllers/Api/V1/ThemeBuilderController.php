<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderTemplate;
use App\Services\Builder\BuilderDocumentRules;
use App\Services\Builder\ThemePresetLibrary;
use App\Services\Builder\ThemeTemplateKinds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ThemeBuilderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = BuilderTemplate::query()->where('tenant_id', $tid)->orderByDesc('is_default')->orderByDesc('priority')->orderBy('title')->get();
        $grouped = $rows->groupBy('kind');
        $kinds = [];
        foreach (ThemeTemplateKinds::KINDS as $kind => $label) {
            $kinds[] = [
                'kind' => $kind,
                'label' => $label,
                'templates' => ($grouped->get($kind) ?? collect())->map(fn (BuilderTemplate $row) => $this->summary($row))->values(),
            ];
        }

        return response()->json(['data' => ['kinds' => $kinds]]);
    }

    public function show(Request $request, int $template): JsonResponse
    {
        return response()->json(['data' => $this->detail($this->row($request, $template))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => 'required|string|in:'.implode(',', array_keys(ThemeTemplateKinds::KINDS)),
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:120',
            'document' => 'nullable|array',
            'priority' => 'nullable|integer|min:0|max:1000',
            'is_default' => 'nullable|boolean',
            ...ThemeTemplateKinds::conditionRules(),
        ]);
        $tid = (int) $request->user()->tenant_id;
        $exists = BuilderTemplate::query()->where('tenant_id', $tid)->where('kind', $data['kind'])->exists();
        $makeDefault = $exists ? (bool) ($data['is_default'] ?? false) : true;

        $row = new BuilderTemplate([
            'tenant_id' => $tid,
            'kind' => $data['kind'],
            'slug' => $this->slug($tid, $data['kind'], $data['slug'] ?? $data['title']),
            'title' => $data['title'],
            'priority' => (int) ($data['priority'] ?? 0),
            'conditions' => $data['conditions'] ?? null,
            'is_default' => false,
            'draft' => BuilderDocumentRules::normalize($data['document'] ?? null),
        ]);
        $row->save();
        if ($makeDefault) {
            $this->markDefault($row);
        }

        return response()->json(['data' => $this->detail($row->fresh())], 201);
    }

    public function update(Request $request, int $template): JsonResponse
    {
        $row = $this->row($request, $template);
        $data = $request->validate([
            'title' => 'sometimes|string|max:255',
            'slug' => 'sometimes|string|max:120',
            'document' => 'sometimes|array',
            'priority' => 'sometimes|integer|min:0|max:1000',
            ...ThemeTemplateKinds::conditionRules(),
        ]);
        if (isset($data['title'])) {
            $row->title = $data['title'];
        }
        if (isset($data['slug'])) {
            $row->slug = $this->slug((int) $row->tenant_id, $row->kind, $data['slug'], $row->id);
        }
        if (array_key_exists('document', $data)) {
            $row->draft = BuilderDocumentRules::normalize($data['document']);
        }
        if (isset($data['priority'])) {
            $row->priority = (int) $data['priority'];
        }
        if (array_key_exists('conditions', $data)) {
            $row->conditions = $data['conditions'];
        }
        $row->save();

        return response()->json(['data' => $this->detail($row)]);
    }

    public function publish(Request $request, int $template): JsonResponse
    {
        $row = $this->row($request, $template);
        abort_if(! is_array($row->draft), 422, 'draft missing');
        $row->published = $row->draft;
        $row->save();

        return response()->json(['data' => $this->detail($row)]);
    }

    public function makeDefault(Request $request, int $template): JsonResponse
    {
        $row = $this->row($request, $template);
        $this->markDefault($row);

        return response()->json(['data' => $this->detail($row->fresh())]);
    }

    public function destroy(Request $request, int $template): JsonResponse
    {
        $row = $this->row($request, $template);
        $wasDefault = (bool) $row->is_default;
        $tid = (int) $row->tenant_id;
        $kind = $row->kind;
        $row->delete();
        if ($wasDefault) {
            $next = BuilderTemplate::query()->where('tenant_id', $tid)->where('kind', $kind)->orderBy('id')->first();
            if ($next) {
                $this->markDefault($next);
            }
        }

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function library(): JsonResponse
    {
        $library = app(ThemePresetLibrary::class);

        return response()->json(['data' => [
            'presets' => $library->presets(),
            'kits' => $library->kits(),
        ]]);
    }

    public function apply(Request $request): JsonResponse
    {
        $data = $request->validate(['preset' => 'required|string|max:80']);
        $library = app(ThemePresetLibrary::class);
        $preset = $library->find($data['preset']);
        abort_unless($preset, 404);
        $tid = (int) $request->user()->tenant_id;
        if (($preset['kind'] ?? '') === 'kit') {
            $created = [];
            foreach ($preset['includes'] as $id) {
                $item = $library->find((string) $id);
                if ($item && ($item['kind'] ?? '') !== 'kit') {
                    $created[] = $this->importPreset($tid, $item);
                }
            }

            return response()->json(['data' => ['templates' => $created]], 201);
        }

        return response()->json(['data' => $this->importPreset($tid, $preset)], 201);
    }

    /** @param  array<string, mixed>  $preset */
    private function importPreset(int $tenantId, array $preset): array
    {
        $kind = (string) $preset['kind'];
        $exists = BuilderTemplate::query()->where('tenant_id', $tenantId)->where('kind', $kind)->exists();
        $row = BuilderTemplate::query()->create([
            'tenant_id' => $tenantId,
            'kind' => $kind,
            'slug' => $this->slug($tenantId, $kind, (string) $preset['id']),
            'title' => (string) $preset['title'],
            'is_default' => false,
            'priority' => 0,
            'conditions' => null,
            'draft' => BuilderDocumentRules::normalize(is_array($preset['document'] ?? null) ? $preset['document'] : null),
        ]);
        if (! $exists) {
            $this->markDefault($row);
            $row->refresh();
        }

        return $this->summary($row);
    }

    private function markDefault(BuilderTemplate $row): void
    {
        DB::transaction(function () use ($row) {
            BuilderTemplate::query()
                ->where('tenant_id', $row->tenant_id)
                ->where('kind', $row->kind)
                ->where('id', '!=', $row->id)
                ->update(['is_default' => false]);
            $row->is_default = true;
            $row->save();
        });
    }

    private function row(Request $request, int $template): BuilderTemplate
    {
        return BuilderTemplate::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($template);
    }

    private function slug(int $tenantId, string $kind, ?string $slug, ?int $ignoreId = null): string
    {
        $base = Str::slug((string) $slug, '-');
        if ($base === '') {
            $base = $kind;
        }
        $candidate = $base;
        $i = 2;
        while (
            BuilderTemplate::query()
                ->where('tenant_id', $tenantId)
                ->where('kind', $kind)
                ->where('slug', $candidate)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $candidate = $base.'-'.$i;
            $i++;
        }

        return $candidate;
    }

    /** @return array<string, mixed> */
    private function summary(BuilderTemplate $row): array
    {
        return [
            'id' => $row->id,
            'kind' => $row->kind,
            'slug' => $row->slug,
            'title' => $row->title,
            'is_default' => (bool) $row->is_default,
            'priority' => (int) $row->priority,
            'conditions' => $row->conditions,
            'has_draft' => is_array($row->draft),
            'has_published' => is_array($row->published),
        ];
    }

    /** @return array<string, mixed> */
    private function detail(BuilderTemplate $row): array
    {
        return [
            ...$this->summary($row),
            'document' => $row->draft ?? ['version' => 1, 'sections' => []],
            'published_document' => $row->published,
        ];
    }
}
