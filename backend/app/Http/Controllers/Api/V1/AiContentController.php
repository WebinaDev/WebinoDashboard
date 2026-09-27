<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\AiContent\AiCalendar;
use App\Services\AiContent\AiContentSettings;
use App\Services\AiContent\AiProposals;
use App\Services\AiContent\AiProviders;
use App\Services\AiContent\AiQueue;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AiContentController extends Controller
{
    public function __construct(
        private readonly AiQueue $queue,
        private readonly AiCalendar $calendar,
        private readonly AiProposals $proposals,
        private readonly AiProviders $providers,
    ) {}

    public function overview(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $settings = AiContentSettings::public($tid);
        $jobs = DB::table('ai_jobs')->where('tenant_id', $tid);
        $byStatus = (clone $jobs)->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');

        return response()->json([
            'data' => [
                'enabled' => AiContentSettings::enabled($tid),
                'has_key' => AiContentSettings::hasAnyKey($tid),
                'default_provider' => $settings['default_provider'] ?? 'grok',
                'jobs' => [
                    'pending' => (int) ($byStatus['pending'] ?? 0),
                    'running' => (int) ($byStatus['running'] ?? 0),
                    'completed' => (int) ($byStatus['completed'] ?? 0),
                    'failed' => (int) ($byStatus['failed'] ?? 0),
                ],
                'calendar_planned' => DB::table('ai_calendar')->where('tenant_id', $tid)->where('status', 'planned')->count(),
                'proposals_pending' => DB::table('ai_proposals')->where('tenant_id', $tid)->where('status', 'pending')->count(),
                'incomplete_products' => $this->incompleteProducts($tid, 5)['total'],
            ],
        ]);
    }

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => AiContentSettings::public((int) $request->user()->tenant_id)]);
    }

    public function saveSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $payload = $request->input('payload', $request->all());
        if (! is_array($payload)) {
            $payload = [];
        }
        $saved = AiContentSettings::save((int) $request->user()->tenant_id, $payload);

        return response()->json(['data' => $saved]);
    }

    public function gapgptModels(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => ['models' => $this->providers->gapgptModels((int) $request->user()->tenant_id)]]);
    }

    public function costEstimate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $in = max(0, (int) $request->input('tokens_in', 1000));
        $out = max(0, (int) $request->input('tokens_out', 1500));

        return response()->json([
            'data' => [
                'tokens_in' => $in,
                'tokens_out' => $out,
                'cost_toman' => $this->providers->estimateCostToman($tid, $in, $out),
                'usd_to_toman' => AiContentSettings::get($tid)['usd_to_toman'] ?? 100000,
            ],
        ]);
    }

    public function jobs(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json([
            'data' => $this->queue->listJobs(
                $tid,
                max(1, (int) $request->query('page', 1)),
                max(1, min(100, (int) $request->query('per_page', 20))),
                $request->query('status')
            ),
        ]);
    }

    public function job(Request $request, int $job): \Illuminate\Http\JsonResponse
    {
        $row = $this->queue->getJob((int) $request->user()->tenant_id, $job);
        if (! $row) {
            return response()->json(['message' => 'Job not found'], 404);
        }

        return response()->json(['data' => $row]);
    }

    public function retryJob(Request $request, int $job): \Illuminate\Http\JsonResponse
    {
        $id = $this->queue->retry((int) $request->user()->tenant_id, $job);
        if (! $id) {
            return response()->json(['message' => 'Job not found'], 404);
        }

        return response()->json(['data' => ['job_id' => $id]], 202);
    }

    public function cancelJob(Request $request, int $job): \Illuminate\Http\JsonResponse
    {
        $ok = $this->queue->cancel((int) $request->user()->tenant_id, $job);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function cancelPending(Request $request): \Illuminate\Http\JsonResponse
    {
        $n = $this->queue->cancelPending((int) $request->user()->tenant_id);

        return response()->json(['data' => ['cancelled' => $n]]);
    }

    public function runDue(Request $request): \Illuminate\Http\JsonResponse
    {
        $n = $this->queue->runDue((int) $request->user()->tenant_id, max(1, min(20, (int) $request->input('limit', 5))));

        return response()->json(['data' => ['processed' => $n]]);
    }

    public function runOne(Request $request, int $job): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        // Re-queue if failed/cancelled into pending then force process
        $row = $this->queue->getJob($tid, $job);
        if (! $row) {
            return response()->json(['message' => 'Job not found'], 404);
        }
        if ($row['status'] !== 'pending') {
            DB::table('ai_jobs')->where('tenant_id', $tid)->where('id', $job)->update([
                'status' => 'pending', 'error_message' => null, 'updated_at' => now(),
            ]);
        }
        $this->queue->processJob($tid, $job, true);
        $fresh = $this->queue->getJob($tid, $job);

        return response()->json(['data' => ['ok' => true, 'job' => $fresh]]);
    }

    public function queueGet(Request $request): \Illuminate\Http\JsonResponse
    {
        $s = AiContentSettings::get((int) $request->user()->tenant_id);

        return response()->json(['data' => ['paused' => ! empty($s['queue_paused'])]]);
    }

    public function queuePost(Request $request): \Illuminate\Http\JsonResponse
    {
        $paused = filter_var($request->input('paused', false), FILTER_VALIDATE_BOOLEAN);
        AiContentSettings::save((int) $request->user()->tenant_id, ['queue_paused' => $paused]);

        return response()->json(['data' => ['paused' => $paused]]);
    }

    public function generate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $type = (string) $request->input('type', '');
        $id = (int) $request->input('id', 0);
        $sync = filter_var($request->input('sync', false), FILTER_VALIDATE_BOOLEAN)
            || filter_var($request->input('run_now', false), FILTER_VALIDATE_BOOLEAN);
        $payload = is_array($request->input('payload')) ? $request->input('payload') : [];

        $map = [
            'product' => ['product_fill', 'product'],
            'post' => ['blog_write', 'post'],
            'product_cat' => ['term_fill', 'product_cat'],
            'product_brand' => ['term_fill', 'product_brand'],
            'category' => ['term_fill', 'category'],
            'blog' => ['blog_write', 'calendar'],
            'page' => ['page_design', 'page'],
        ];
        if (! isset($map[$type])) {
            return response()->json(['message' => 'Invalid generate type'], 400);
        }
        if ($type === 'post' || $type === 'page' || $type === 'product' || str_contains($type, 'cat') || str_contains($type, 'brand')) {
            if ($id < 1 && $type !== 'blog') {
                return response()->json(['message' => 'id required'], 400);
            }
        }
        if ($type === 'post') {
            $payload['post_id'] = $id;
        }
        if ($type === 'blog') {
            $payload = array_merge($payload, [
                'topic' => (string) $request->input('topic', $payload['topic'] ?? ''),
                'focus_keyword' => (string) $request->input('focus_keyword', $payload['focus_keyword'] ?? ''),
            ]);
        }
        if ($type === 'page') {
            if ($request->filled('page_prompt')) {
                $payload['page_prompt'] = (string) $request->input('page_prompt');
            }
            if ($request->filled('focus_keyword')) {
                $payload['focus_keyword'] = (string) $request->input('focus_keyword');
            }
        }

        [$jobType, $targetType] = $map[$type];
        $jobId = $this->queue->enqueue($tid, $jobType, $targetType, $id, $payload);
        if ($sync) {
            $this->queue->processJob($tid, $jobId, true);
            $job = $this->queue->getJob($tid, $jobId);
            if (($job['status'] ?? '') === 'failed') {
                return response()->json([
                    'message' => (string) ($job['error_message'] ?? 'Generation failed'),
                    'errors' => ['job_id' => $jobId],
                ], 500);
            }

            return response()->json(['data' => ['ok' => true, 'job_id' => $jobId, 'job' => $job, 'queued' => false]]);
        }

        return response()->json(['data' => ['ok' => true, 'job_id' => $jobId, 'queued' => true]], 202);
    }

    public function productsIncomplete(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $limit = max(1, min(100, (int) $request->query('limit', 50)));

        return response()->json(['data' => $this->incompleteProducts($tid, $limit)]);
    }

    public function productsFillBatch(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $ids = array_map('intval', is_array($request->input('product_ids')) ? $request->input('product_ids') : []);
        if ($ids === []) {
            $ids = array_column($this->incompleteProducts($tid, max(1, min(50, (int) $request->input('limit', 10))))['items'], 'id');
        }
        $jobIds = [];
        foreach ($ids as $pid) {
            $jobIds[] = $this->queue->enqueue($tid, 'product_fill', 'product', $pid, []);
        }

        return response()->json(['data' => ['job_ids' => $jobIds, 'queued' => count($jobIds)]], 202);
    }

    public function calendarList(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => $this->calendar->list(
                (int) $request->user()->tenant_id,
                $request->query('from'),
                $request->query('to')
            ),
        ]);
    }

    public function calendarCreate(Request $request): \Illuminate\Http\JsonResponse
    {
        $row = $this->calendar->create((int) $request->user()->tenant_id, $request->all());

        return response()->json(['data' => $row], 201);
    }

    public function calendarBulk(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $items = is_array($request->input('items')) ? $request->input('items') : [];
        $created = [];
        foreach ($items as $item) {
            if (is_array($item)) {
                $created[] = $this->calendar->create($tid, $item);
            }
        }

        return response()->json(['data' => ['items' => $created]], 201);
    }

    public function calendarPatch(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $row = $this->calendar->patch((int) $request->user()->tenant_id, $id, $request->all());
        if (! $row) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json(['data' => $row]);
    }

    public function calendarDelete(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $ok = $this->calendar->delete((int) $request->user()->tenant_id, $id);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function calendarRunDue(Request $request): \Illuminate\Http\JsonResponse
    {
        $n = $this->calendar->runDue((int) $request->user()->tenant_id);

        return response()->json(['data' => ['queued' => $n]]);
    }

    public function attrList(Request $request): \Illuminate\Http\JsonResponse
    {
        $rows = DB::table('ai_attr_templates')->where('tenant_id', (int) $request->user()->tenant_id)->get();

        return response()->json(['data' => ['items' => $rows]]);
    }

    public function attrConfirm(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $catId = (int) $request->input('product_cat_id', 0);
        $attrIds = is_array($request->input('attribute_ids')) ? array_map('intval', $request->input('attribute_ids')) : [];
        $labels = is_array($request->input('labels')) ? $request->input('labels') : [];
        if ($catId < 1) {
            return response()->json(['message' => 'product_cat_id required'], 422);
        }
        DB::table('ai_attr_templates')->updateOrInsert(
            ['tenant_id' => $tid, 'product_cat_id' => $catId],
            [
                'attribute_ids' => json_encode($attrIds),
                'labels' => json_encode($labels, JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        return response()->json(['data' => ['ok' => true]]);
    }

    public function attrDelete(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $ok = DB::table('ai_attr_templates')->where('tenant_id', (int) $request->user()->tenant_id)->where('id', $id)->delete() > 0;

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function suggestCategories(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $ids = array_map('intval', is_array($request->input('product_ids')) ? $request->input('product_ids') : []);
        $jobId = $this->queue->enqueue($tid, 'suggest_categories', 'catalog', 0, ['product_ids' => $ids]);
        if (filter_var($request->input('sync', false), FILTER_VALIDATE_BOOLEAN)) {
            $this->queue->processJob($tid, $jobId, true);
        }

        return response()->json(['data' => ['job_id' => $jobId]], 202);
    }

    public function blogTopics(Request $request): \Illuminate\Http\JsonResponse
    {
        $topics = AiContentSettings::get((int) $request->user()->tenant_id)['blog_topics'] ?? [];

        return response()->json(['data' => ['items' => is_array($topics) ? $topics : []]]);
    }

    public function blogTopicsSuggest(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $jobId = $this->queue->enqueue($tid, 'suggest_blog_topics', 'blog_topics', 0, [
            'count' => max(1, min(20, (int) $request->input('count', 5))),
        ]);
        if (filter_var($request->input('sync', true), FILTER_VALIDATE_BOOLEAN)) {
            $this->queue->processJob($tid, $jobId, true);
        }

        return response()->json(['data' => ['job_id' => $jobId, 'items' => AiContentSettings::get($tid)['blog_topics'] ?? []]]);
    }

    public function blogTopicsApprove(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $id = (string) $request->input('id', '');
        $topics = AiContentSettings::get($tid)['blog_topics'] ?? [];
        if (! is_array($topics)) {
            $topics = [];
        }
        $approved = null;
        foreach ($topics as &$t) {
            if (is_array($t) && (string) ($t['id'] ?? '') === $id) {
                $t['status'] = 'approved';
                $approved = $t;
            }
        }
        unset($t);
        AiContentSettings::save($tid, ['blog_topics' => $topics]);
        $jobId = null;
        if ($approved) {
            $cal = $this->calendar->create($tid, [
                'slot_date' => now()->toDateString(),
                'content_type' => 'blog',
                'topic' => (string) ($approved['topic'] ?? ''),
                'focus_keyword' => (string) ($approved['focus_keyword'] ?? ''),
            ]);
            $jobId = $this->queue->enqueue($tid, 'blog_write', 'calendar', (int) $cal['id'], [
                'topic' => (string) ($approved['topic'] ?? ''),
                'focus_keyword' => (string) ($approved['focus_keyword'] ?? ''),
            ]);
        }

        return response()->json(['data' => ['ok' => (bool) $approved, 'job_id' => $jobId]]);
    }

    public function blogTopicsSkip(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $id = (string) $request->input('id', '');
        $topics = AiContentSettings::get($tid)['blog_topics'] ?? [];
        if (! is_array($topics)) {
            $topics = [];
        }
        foreach ($topics as &$t) {
            if (is_array($t) && (string) ($t['id'] ?? '') === $id) {
                $t['status'] = 'skipped';
            }
        }
        unset($t);
        AiContentSettings::save($tid, ['blog_topics' => $topics]);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function proposals(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'data' => $this->proposals->list(
                (int) $request->user()->tenant_id,
                $request->query('kind'),
                $request->query('status', 'pending')
            ),
        ]);
    }

    public function proposalsEnqueue(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $kind = (string) $request->input('kind', 'title');
        $ids = array_map('intval', is_array($request->input('product_ids')) ? $request->input('product_ids') : []);
        $jobType = $kind === 'category' ? 'suggest_categories' : 'title_rewrite';
        $jobId = $this->queue->enqueue($tid, $jobType, 'catalog', 0, ['product_ids' => $ids]);

        return response()->json(['data' => ['job_id' => $jobId]], 202);
    }

    public function proposalsApply(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $ok = $this->proposals->apply((int) $request->user()->tenant_id, $id);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function proposalsSkip(Request $request, int $id): \Illuminate\Http\JsonResponse
    {
        $ok = $this->proposals->skip((int) $request->user()->tenant_id, $id);

        return response()->json(['data' => ['ok' => $ok]]);
    }

    public function termsFillBatch(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        try {
            AiContentSettings::assertReady($tid);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $type = (string) $request->input('target_type', 'product_cat');
        $ids = array_map('intval', is_array($request->input('ids')) ? $request->input('ids') : []);
        $jobIds = [];
        foreach ($ids as $id) {
            $jobIds[] = $this->queue->enqueue($tid, 'term_fill', $type, $id, []);
        }

        return response()->json(['data' => ['job_ids' => $jobIds]], 202);
    }

    /** @return array{items: list<array<string, mixed>>, total: int} */
    private function incompleteProducts(int $tenantId, int $limit): array
    {
        $q = Product::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($q) {
                $q->whereNull('description')->orWhere('description', '')
                    ->orWhereNull('short_description')->orWhere('short_description', '');
            });
        $total = (clone $q)->count();
        $items = $q->orderByDesc('id')->limit($limit)->get(['id', 'name', 'sku', 'status'])
            ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'status' => $p->status])
            ->all();

        return ['items' => $items, 'total' => $total];
    }
}
