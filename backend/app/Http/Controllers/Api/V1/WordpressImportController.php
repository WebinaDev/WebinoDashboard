<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WordpressImportJob;
use App\Models\WordpressImportQueue;
use App\Models\WordpressImportReceipt;
use App\Models\WordpressRedirect;
use App\Services\WordpressImport\ExportBundleParser;
use App\Services\WordpressImport\ImportUrlGuard;
use App\Services\WordpressImport\WordpressImportResources;
use App\Services\WordpressImport\WordpressImportRunner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Laravel\Sanctum\PersonalAccessToken;

class WordpressImportController extends Controller
{
    public function __construct(
        private readonly WordpressImportRunner $runner,
        private readonly ExportBundleParser $parser,
    ) {}

    public function ping(Request $request): JsonResponse
    {
        $this->assertSchema($request);

        return response()->json([
            'ok' => true,
            'status' => 'ready',
            'schema' => WordpressImportResources::SCHEMA,
            'resources' => WordpressImportResources::advertised(),
            'catalog' => WordpressImportResources::ALL,
            'contract_version' => 1,
            'note' => 'Import token accepted. Push batches with POST /api/v1/import/wordpress/ingest then POST /api/v1/import/wordpress/jobs/{id}/run.',
        ]);
    }

    public function probe(Request $request): JsonResponse
    {
        $this->assertSchema($request);
        $data = $request->validate([
            'source_url' => 'required|string|max:500',
        ]);

        return response()->json([
            'data' => [
                'status' => 'ready',
                'source_url' => $this->sourceUrl($data['source_url']),
                'schema' => WordpressImportResources::SCHEMA,
                'resources' => WordpressImportResources::advertised(),
                'catalog' => WordpressImportResources::ALL,
                'fetch' => false,
                'contract_version' => 1,
                'note' => 'URL shape only. Nothing is downloaded. Push batches with an import token or upload an export.',
            ],
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $this->assertSchema($request);
        $data = $this->validatedOptions($request, true);
        $job = WordpressImportJob::query()->create([
            'tenant_id' => $request->user()->tenant_id,
            'created_by' => $request->user()->id,
            'status' => 'ready',
            'source_url' => $data['source_url'],
            'dry_run' => $data['dry_run'],
            'options' => $data['options'],
            'summary' => [
                'schema' => WordpressImportResources::SCHEMA,
                'resources' => WordpressImportResources::advertised(),
                'note' => 'Waiting for an export upload or plugin batches. Remote crawling is disabled.',
            ],
            'progress' => ['totals' => ['pending' => 0, 'done' => 0, 'failed' => 0, 'skipped' => 0], 'percent' => 0, 'errors' => []],
        ]);

        return response()->json(['data' => $this->serialize($job)], 201);
    }

    public function update(Request $request, int $job): JsonResponse
    {
        $this->denyPlugin($request);
        $row = $this->job($request, $job);
        if ($row->status === 'running') {
            return response()->json(['message' => 'Import is running.'], 409);
        }
        $data = $this->validatedOptions($request, false);
        $options = is_array($row->options) ? $row->options : [];
        foreach (['currency', 'price_multiplier', 'media_hosts', 'download_media', 'publish_content'] as $key) {
            if ($request->exists($key)) {
                $options[$key] = $data['options'][$key];
            }
        }
        if ($request->exists('mode') || $request->exists('resources')) {
            $options['resources'] = $data['options']['resources'];
        }
        $row->options = $options;
        if ($request->exists('dry_run') && ! $row->items()->where('status', 'done')->exists()) {
            $row->dry_run = $data['dry_run'];
        }
        $row->save();

        return response()->json(['data' => $this->serialize($row)]);
    }

    public function index(Request $request): JsonResponse
    {
        $jobs = WordpressImportJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->latest()
            ->limit(20)
            ->get();

        return response()->json([
            'data' => $jobs->map(fn (WordpressImportJob $job) => $this->serialize($job))->values(),
        ]);
    }

    public function show(Request $request, int $job): JsonResponse
    {
        return response()->json(['data' => $this->serialize($this->job($request, $job), true)]);
    }

    public function batches(Request $request, int $job): JsonResponse
    {
        $this->assertSchema($request);

        return $this->withReceipt($request, function () use ($request, $job) {
            return $this->enqueueBatches($request, $job);
        });
    }

    public function queue(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        $items = WordpressImportQueue::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('job_id', $row->id)
            ->orderBy('id')
            ->limit(100)
            ->get(['id', 'resource', 'external_id', 'label', 'status']);

        return response()->json(['data' => $items]);
    }

    public function permalinks(Request $request): JsonResponse
    {
        $rows = WordpressRedirect::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('id')
            ->limit(500)
            ->get(['id', 'from_path', 'to_path', 'status_code', 'kind', 'resource', 'external_id']);

        return response()->json(['data' => $rows]);
    }

    private function enqueueBatches(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        $data = $request->validate([
            'resource' => 'required|string|max:64',
            'items' => 'required|array|max:50',
            'items.*' => 'array',
        ]);
        try {
            $bundles = $this->parser->fromArray([
                'resource' => $data['resource'],
                'items' => $data['items'],
            ]);
            $result = $this->runner->enqueue($row, $bundles);
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['items' => $e->getMessage()]);
        }

        return response()->json(['data' => [
            'job' => $this->serialize($row->fresh(), true),
            ...$result,
        ]]);
    }

    public function ingest(Request $request): JsonResponse
    {
        $this->assertSchema($request);

        return $this->withReceipt($request, function () use ($request) {
            return $this->ingestBatch($request);
        });
    }

    private function ingestBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_url' => 'required|string|max:500',
            'resource' => 'required|string|max:64',
            'items' => 'required|array|max:50',
            'items.*' => 'array',
            'dry_run' => 'sometimes|boolean',
            'currency' => 'sometimes|string|max:8',
            'price_multiplier' => 'sometimes|numeric|min:0.0001|max:100000',
            'media_hosts' => 'sometimes|array|max:10',
            'media_hosts.*' => 'string|max:253',
            'download_media' => 'sometimes|boolean',
            'publish_content' => 'sometimes|boolean',
            'mode' => 'sometimes|string|in:full,selective',
            'resources' => 'sometimes|array',
            'resources.*' => ['string', Rule::in(WordpressImportResources::advertised())],
        ]);
        $source = $this->sourceUrl($data['source_url']);
        $row = WordpressImportJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('source_url', $source)
            ->whereIn('status', ['ready', 'running', 'paused', 'completed', 'completed_with_errors', 'failed'])
            ->latest()
            ->first();
        if (! $row) {
            $options = $this->optionBag($data, $request);
            $row = WordpressImportJob::query()->create([
                'tenant_id' => $request->user()->tenant_id,
                'created_by' => $request->user()->id,
                'status' => 'ready',
                'source_url' => $source,
                'dry_run' => (bool) ($data['dry_run'] ?? false),
                'options' => $options,
                'summary' => ['note' => 'Opened by an authenticated import push.'],
            ]);
        }
        try {
            $result = $this->runner->enqueue($row, $this->parser->fromArray([
                'resource' => $data['resource'],
                'items' => $data['items'],
            ]));
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['items' => $e->getMessage()]);
        }

        return response()->json(['data' => [
            'job' => $this->serialize($row->fresh(), true),
            ...$result,
        ]], 201);
    }

    public function upload(Request $request, int $job): JsonResponse
    {
        $this->assertSchema($request);
        $row = $this->job($request, $job);
        try {
            if ($request->hasFile('file')) {
                $request->validate(['file' => 'required|file|max:20480']);
                $file = $request->file('file');
                $bundles = $this->parser->fromUpload((string) file_get_contents($file->getRealPath()), $file->getClientOriginalName());
            } else {
                $bundles = $this->parser->fromArray($request->all());
            }
            $result = $this->runner->enqueue($row, $bundles);
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['file' => $e->getMessage()]);
        }

        return response()->json(['data' => [
            'job' => $this->serialize($row->fresh(), true),
            ...$result,
        ]]);
    }

    public function run(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        $limit = (int) $request->input('limit', 25);
        try {
            $row = $this->runner->tick($row, $limit);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => $this->serialize($row, true)]);
    }

    public function pause(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        $row->status = 'paused';
        $row->save();

        return response()->json(['data' => $this->serialize($row, true)]);
    }

    public function resume(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        if ($row->status === 'paused') {
            $row->status = 'ready';
            $row->save();
        }

        return $this->run($request, $job);
    }

    public function retry(Request $request, int $job): JsonResponse
    {
        $row = $this->job($request, $job);
        $count = $this->runner->retryFailed($row);

        return response()->json(['data' => [
            'retried' => $count,
            'job' => $this->serialize($row->fresh(), true),
        ]]);
    }

    public function tokens(Request $request): JsonResponse
    {
        $this->denyPlugin($request);
        $ids = User::query()->where('tenant_id', $request->user()->tenant_id)->pluck('id');
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $ids)
            ->where('name', 'like', 'wordpress-import:%')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PersonalAccessToken $token) => $this->tokenRow($token))
            ->values();

        return response()->json(['data' => $tokens]);
    }

    public function storeToken(Request $request): JsonResponse
    {
        $this->denyPlugin($request);
        $data = $request->validate([
            'name' => 'required|string|max:80',
        ]);
        $label = trim($data['name']);
        $issued = $request->user()->createToken('wordpress-import:'.$label, ['wordpress-import']);

        return response()->json(['data' => [
            ...$this->tokenRow($issued->accessToken),
            'token' => $issued->plainTextToken,
        ]], 201);
    }

    public function destroyToken(Request $request, int $token): JsonResponse
    {
        $this->denyPlugin($request);
        $ids = User::query()->where('tenant_id', $request->user()->tenant_id)->pluck('id');
        $row = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $ids)
            ->where('name', 'like', 'wordpress-import:%')
            ->findOrFail($token);
        $row->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function job(Request $request, int $id): WordpressImportJob
    {
        return WordpressImportJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($id);
    }

    /** @return array{source_url: string, dry_run: bool, options: array<string, mixed>} */
    private function validatedOptions(Request $request, bool $creating): array
    {
        $data = $request->validate([
            'source_url' => [$creating ? 'required' : 'sometimes', 'string', 'max:500'],
            'dry_run' => 'sometimes|boolean',
            'currency' => 'sometimes|string|max:8',
            'price_multiplier' => 'sometimes|numeric|min:0.0001|max:100000',
            'media_hosts' => 'sometimes|array|max:10',
            'media_hosts.*' => 'string|max:253',
            'download_media' => 'sometimes|boolean',
            'publish_content' => 'sometimes|boolean',
            'mode' => 'sometimes|string|in:full,selective',
            'resources' => 'sometimes|array',
            'resources.*' => ['string', Rule::in(WordpressImportResources::advertised())],
        ]);
        $source = isset($data['source_url']) || $creating
            ? $this->sourceUrl((string) ($data['source_url'] ?? ''))
            : '';

        return [
            'source_url' => $source,
            'dry_run' => (bool) ($data['dry_run'] ?? false),
            'options' => $this->optionBag($data, $request),
        ];
    }

    /** @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function optionBag(array $data, Request $request): array
    {
        $mode = strtolower(trim((string) ($data['mode'] ?? '')));
        if ($mode === 'selective' && (! isset($data['resources']) || ! is_array($data['resources']) || $data['resources'] === [])) {
            throw ValidationException::withMessages(['resources' => 'Select at least one resource.']);
        }
        $resources = null;
        if ($mode !== 'full' && isset($data['resources']) && is_array($data['resources']) && $data['resources'] !== []) {
            $resources = array_values(array_unique(array_map(
                fn ($resource) => WordpressImportResources::canonical((string) $resource),
                $data['resources']
            )));
        }
        $currency = strtoupper(trim((string) ($data['currency'] ?? $request->user()->tenant?->default_currency ?? 'IRT')));

        return [
            'currency' => $currency !== '' ? mb_substr($currency, 0, 8) : 'IRT',
            'price_multiplier' => (float) ($data['price_multiplier'] ?? 1),
            'media_hosts' => $this->hosts(is_array($data['media_hosts'] ?? null) ? $data['media_hosts'] : []),
            'download_media' => (bool) ($data['download_media'] ?? true),
            'publish_content' => (bool) ($data['publish_content'] ?? false),
            'resources' => $resources,
        ];
    }

    /** @param  list<mixed>  $hosts
     * @return list<string>
     */
    private function hosts(array $hosts): array
    {
        $clean = [];
        foreach ($hosts as $host) {
            $host = strtolower(trim((string) $host));
            if ($host === '') {
                continue;
            }
            if (ImportUrlGuard::isBlockedHost($host)) {
                throw ValidationException::withMessages(['media_hosts' => 'Host is not allowed.']);
            }
            $clean[] = $host;
        }

        return array_values(array_unique($clean));
    }

    private function sourceUrl(string $url): string
    {
        try {
            return ImportUrlGuard::normalizeSource($url);
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['source_url' => $e->getMessage()]);
        }
    }

    private function assertSchema(Request $request): void
    {
        $schema = $request->header('X-Webino-Import-Schema');
        if (($schema === null || $schema === '') && $request->exists('schema')) {
            $schema = $request->input('schema');
        }
        if ($schema === null || $schema === '') {
            return;
        }
        if (! is_string($schema) || ! in_array($schema, WordpressImportResources::SCHEMAS, true)) {
            throw ValidationException::withMessages([
                'schema' => 'Unsupported import schema. Expected '.WordpressImportResources::SCHEMA.'.',
            ]);
        }
    }

    /**
     * Replay the controller payload (before the API envelope) so a repeated
     * X-Webino-Idempotency-Key does not enqueue the batch twice.
     *
     * @param  callable(): JsonResponse  $handler
     */
    private function withReceipt(Request $request, callable $handler): JsonResponse
    {
        $key = trim((string) $request->header('X-Webino-Idempotency-Key', ''));
        if ($key === '') {
            return $handler();
        }
        if (mb_strlen($key) > 191) {
            throw ValidationException::withMessages(['idempotency_key' => 'Idempotency key is too long.']);
        }
        $tenantId = (int) $request->user()->tenant_id;
        $existing = WordpressImportReceipt::query()
            ->where('tenant_id', $tenantId)
            ->where('idempotency_key', $key)
            ->first();
        if ($existing && is_array($existing->body)) {
            return response()->json($existing->body, (int) $existing->status_code);
        }
        $response = $handler();
        $decoded = json_decode($response->getContent(), true);
        if (is_array($decoded) && $response->getStatusCode() >= 200 && $response->getStatusCode() < 300) {
            WordpressImportReceipt::query()->create([
                'tenant_id' => $tenantId,
                'idempotency_key' => $key,
                'status_code' => $response->getStatusCode(),
                'body' => $decoded,
            ]);
        }

        return $response;
    }

    private function denyPlugin(Request $request): void
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken && str_starts_with((string) $token->name, 'wordpress-import:')) {
            abort(403, 'Import tokens cannot manage credentials.');
        }
    }

    /** @return array<string, mixed> */
    private function tokenRow(PersonalAccessToken $token): array
    {
        $name = (string) $token->name;

        return [
            'id' => $token->id,
            'name' => str_starts_with($name, 'wordpress-import:') ? substr($name, strlen('wordpress-import:')) : $name,
            'abilities' => $token->abilities,
            'last_used_at' => optional($token->last_used_at)?->toIso8601String(),
            'created_at' => optional($token->created_at)?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function serialize(WordpressImportJob $job, bool $detailed = false): array
    {
        $progress = is_array($job->progress) ? $job->progress : [];
        $payload = [
            'id' => $job->id,
            'status' => $job->status,
            'source_url' => $job->source_url,
            'dry_run' => (bool) $job->dry_run,
            'summary' => $job->summary,
            'options' => $job->options,
            'progress' => $progress,
            'last_error' => $job->last_error,
            'started_at' => optional($job->started_at)?->toIso8601String(),
            'finished_at' => optional($job->finished_at)?->toIso8601String(),
            'created_at' => optional($job->created_at)?->toIso8601String(),
        ];
        if ($detailed) {
            $payload['stats'] = $this->runner->stats($job);
        }

        return $payload;
    }
}
