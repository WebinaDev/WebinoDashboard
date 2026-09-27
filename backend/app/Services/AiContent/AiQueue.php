<?php

namespace App\Services\AiContent;

use App\Models\Brand;
use App\Models\Category;
use App\Models\CmsPage;
use App\Models\Product;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;

final class AiQueue
{
    public function __construct(
        private readonly AiProviders $providers,
        private readonly AiPrompts $prompts,
        private readonly AiWriter $writer,
        private readonly AiSeoGate $seo,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public function enqueue(int $tenantId, string $jobType, string $targetType, int $targetId, array $payload = []): int
    {
        return (int) DB::table('ai_jobs')->insertGetId([
            'tenant_id' => $tenantId,
            'job_type' => $jobType,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'status' => 'pending',
            'result_summary' => 'queued',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array<string, mixed>|null */
    public function getJob(int $tenantId, int $jobId): ?array
    {
        $row = DB::table('ai_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->first();

        return $row ? $this->normalizeJob($row) : null;
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function listJobs(int $tenantId, int $page = 1, int $perPage = 20, ?string $status = null): array
    {
        $q = DB::table('ai_jobs')->where('tenant_id', $tenantId);
        if ($status) {
            $q->where('status', $status);
        }
        $total = (clone $q)->count();
        $items = $q->orderByDesc('id')->forPage($page, $perPage)->get()->map(fn ($r) => $this->normalizeJob($r))->all();

        return ['items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
    }

    public function cancel(int $tenantId, int $jobId): bool
    {
        return DB::table('ai_jobs')
            ->where('tenant_id', $tenantId)
            ->where('id', $jobId)
            ->whereIn('status', ['pending', 'running'])
            ->update(['status' => 'cancelled', 'updated_at' => now(), 'result_summary' => 'cancelled']) > 0;
    }

    public function cancelPending(int $tenantId): int
    {
        return DB::table('ai_jobs')
            ->where('tenant_id', $tenantId)
            ->where('status', 'pending')
            ->update(['status' => 'cancelled', 'updated_at' => now(), 'result_summary' => 'cancelled']);
    }

    public function retry(int $tenantId, int $jobId): ?int
    {
        $job = $this->getJob($tenantId, $jobId);
        if (! $job) {
            return null;
        }

        return $this->enqueue(
            $tenantId,
            (string) $job['job_type'],
            (string) $job['target_type'],
            (int) $job['target_id'],
            is_array($job['payload'] ?? null) ? $job['payload'] : []
        );
    }

    public function processJob(int $tenantId, int $jobId, bool $force = false): void
    {
        $settings = AiContentSettings::get($tenantId);
        if (! $force && ! empty($settings['queue_paused'])) {
            return;
        }
        $claimed = DB::table('ai_jobs')
            ->where('tenant_id', $tenantId)
            ->where('id', $jobId)
            ->where('status', 'pending')
            ->update([
                'status' => 'running',
                'started_at' => now(),
                'updated_at' => now(),
                'attempts' => DB::raw('attempts + 1'),
                'result_summary' => 'running',
            ]);
        if (! $claimed) {
            return;
        }
        $job = $this->getJob($tenantId, $jobId);
        if (! $job) {
            return;
        }
        try {
            AiContentSettings::assertReady($tenantId);
            $result = $this->execute($tenantId, $job);
            $tokensIn = (int) ($result['tokens_in'] ?? 0);
            $tokensOut = (int) ($result['tokens_out'] ?? 0);
            DB::table('ai_jobs')->where('id', $jobId)->update([
                'status' => 'completed',
                'provider' => (string) ($result['provider'] ?? ''),
                'model' => (string) ($result['model'] ?? ''),
                'tokens_in' => $tokensIn,
                'tokens_out' => $tokensOut,
                'cost_toman' => $this->providers->estimateCostToman($tenantId, $tokensIn, $tokensOut),
                'result_summary' => (string) ($result['summary'] ?? 'done'),
                'error_message' => null,
                'finished_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Throwable $e) {
            DB::table('ai_jobs')->where('id', $jobId)->update([
                'status' => 'failed',
                'error_message' => mb_substr($e->getMessage(), 0, 2000),
                'result_summary' => 'failed',
                'finished_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function runDue(int $tenantId, int $limit = 5): int
    {
        $ids = DB::table('ai_jobs')
            ->where('tenant_id', $tenantId)
            ->where('status', 'pending')
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id');
        foreach ($ids as $id) {
            $this->processJob($tenantId, (int) $id);
        }

        return $ids->count();
    }

    public function tickAllTenants(): void
    {
        Tenant::query()->select('id')->orderBy('id')->chunkById(50, function ($rows) {
            foreach ($rows as $t) {
                $tid = (int) $t->id;
                if (! AiContentSettings::enabled($tid) || ! AiContentSettings::hasAnyKey($tid)) {
                    continue;
                }
                app(AiCalendar::class)->runDue($tid);
                $this->runDue($tid, 3);
            }
        });
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    private function execute(int $tenantId, array $job): array
    {
        $type = (string) $job['job_type'];
        $targetType = (string) $job['target_type'];
        $targetId = (int) $job['target_id'];
        $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];

        return match ($type) {
            'product_fill' => $this->jobProductFill($tenantId, $targetId, $payload),
            'blog_write' => $this->jobBlogWrite($tenantId, $targetId, $targetType, $payload),
            'term_fill' => $this->jobTermFill($tenantId, $targetType, $targetId, $payload),
            'page_design' => $this->jobPage($tenantId, $targetId, $payload),
            'suggest_blog_topics' => $this->jobSuggestTopics($tenantId, $payload),
            'title_rewrite' => $this->jobTitleRewrite($tenantId, $payload),
            'suggest_categories' => $this->jobSuggestCategories($tenantId, $payload),
            default => throw new \RuntimeException('Unknown job type: '.$type),
        };
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobProductFill(int $tenantId, int $productId, array $payload): array
    {
        if (! AiContentSettings::entityEnabled($tenantId, 'product')) {
            throw new \RuntimeException('Product generation disabled');
        }
        $p = Product::query()->where('tenant_id', $tenantId)->with(['category', 'brands'])->findOrFail($productId);
        $related = Product::query()
            ->where('tenant_id', $tenantId)
            ->where('id', '!=', $productId)
            ->when($p->category_id, fn ($q) => $q->where('category_id', $p->category_id))
            ->limit(8)
            ->get(['id', 'name'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name])
            ->all();
        $ctx = [
            'id' => $p->id,
            'name' => $p->name,
            'sku' => $p->sku,
            'short_description' => $p->short_description,
            'description' => $p->description,
            'categories' => $p->category ? [['id' => $p->category->id, 'name' => $p->category->name]] : [],
            'brands' => $p->brands->map(fn ($b) => ['id' => $b->id, 'name' => $b->name])->all(),
            'focus_keyword' => (string) ($payload['focus_keyword'] ?? ''),
            'related' => $related,
        ];
        $result = $this->completeWithSeo($tenantId, 'product', $ctx, $this->prompts->productSchema(),
            fn ($c) => $this->prompts->productUser($tenantId, $c),
            fn ($data) => [(string) ($data['focus_keyword'] ?? $p->name), (string) ($data['description'] ?? ''), (string) ($data['name'] ?? $p->name)]
        );
        $data = $result['data'];
        $settings = AiContentSettings::get($tenantId);
        $this->writer->applyProduct($tenantId, $productId, $data, [
            'related_ids' => array_column($related, 'id'),
            'set_status' => ! empty($payload['set_status']),
            'publish' => ! empty($settings['auto_publish']),
            'status' => $settings['publish_status'],
        ]);
        $this->recordRun($tenantId, 'product', $productId, (string) ($data['focus_keyword'] ?? ''), (string) ($data['name'] ?? $p->name), (string) ($data['description'] ?? ''));

        return [
            'provider' => $result['provider'] ?? '',
            'model' => $result['model'] ?? '',
            'tokens_in' => $result['tokens_in'] ?? 0,
            'tokens_out' => $result['tokens_out'] ?? 0,
            'summary' => 'Product #'.$productId.' updated',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobBlogWrite(int $tenantId, int $targetId, string $targetType, array $payload): array
    {
        if (! AiContentSettings::entityEnabled($tenantId, 'blog')) {
            throw new \RuntimeException('Blog generation disabled');
        }
        $ctx = [
            'topic' => (string) ($payload['topic'] ?? ''),
            'focus_keyword' => (string) ($payload['focus_keyword'] ?? ''),
            'secondary_keywords' => $payload['secondary_keywords'] ?? [],
            'post_id' => $targetType === 'post' ? $targetId : 0,
        ];
        $result = $this->completeWithSeo($tenantId, 'blog', $ctx, $this->prompts->blogSchema(),
            fn ($c) => $this->prompts->blogUser($tenantId, $c),
            fn ($data) => [(string) ($data['focus_keyword'] ?? $ctx['focus_keyword']), (string) ($data['body'] ?? ''), (string) ($data['title'] ?? '')]
        );
        $data = $result['data'];
        $settings = AiContentSettings::get($tenantId);
        $postId = $targetType === 'post' ? $targetId : null;
        $post = $this->writer->applyBlog($tenantId, $postId, $data, [
            'topic' => $ctx['topic'],
            'category_id' => $payload['category_id'] ?? null,
            'publish' => ! empty($settings['auto_publish']),
        ]);
        if ($targetType === 'calendar' && $targetId > 0) {
            DB::table('ai_calendar')->where('tenant_id', $tenantId)->where('id', $targetId)->update([
                'status' => 'done',
                'updated_at' => now(),
            ]);
        }
        $this->recordRun($tenantId, 'post', (int) $post->id, (string) ($data['focus_keyword'] ?? ''), (string) ($data['title'] ?? ''), (string) ($data['body'] ?? ''));

        return [
            'provider' => $result['provider'] ?? '',
            'model' => $result['model'] ?? '',
            'tokens_in' => $result['tokens_in'] ?? 0,
            'tokens_out' => $result['tokens_out'] ?? 0,
            'summary' => 'Blog post #'.$post->id.' written',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobTermFill(int $tenantId, string $targetType, int $termId, array $payload): array
    {
        $entity = match ($targetType) {
            'product_brand' => 'product_brand',
            'category' => 'blog',
            default => 'product_cat',
        };
        if ($targetType === 'product_cat' && ! AiContentSettings::entityEnabled($tenantId, 'product_cat')) {
            throw new \RuntimeException('Category generation disabled');
        }
        $name = match ($targetType) {
            'product_brand' => Brand::query()->where('tenant_id', $tenantId)->whereKey($termId)->value('name'),
            'category' => \App\Models\BlogCategory::query()->where('tenant_id', $tenantId)->whereKey($termId)->value('name'),
            default => Category::query()->where('tenant_id', $tenantId)->whereKey($termId)->value('name'),
        };
        if (! $name) {
            throw new \RuntimeException('Term not found');
        }
        $ctx = ['id' => $termId, 'name' => $name, 'type' => $targetType];
        $result = $this->completeWithSeo($tenantId, 'term', $ctx, $this->prompts->termSchema(),
            fn ($c) => $this->prompts->termUser($tenantId, $targetType, $c),
            fn ($data) => [(string) ($data['focus_keyword'] ?? $name), (string) ($data['description'] ?? ''), $name]
        );
        $this->writer->applyTerm($tenantId, $targetType, $termId, $result['data']);
        $this->recordRun($tenantId, $targetType, $termId, (string) ($result['data']['focus_keyword'] ?? ''), $name, (string) ($result['data']['description'] ?? ''));

        return [
            'provider' => $result['provider'] ?? '',
            'model' => $result['model'] ?? '',
            'tokens_in' => $result['tokens_in'] ?? 0,
            'tokens_out' => $result['tokens_out'] ?? 0,
            'summary' => $targetType.' #'.$termId.' updated',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobPage(int $tenantId, int $pageId, array $payload): array
    {
        if (! AiContentSettings::entityEnabled($tenantId, 'page')) {
            throw new \RuntimeException('Page generation disabled');
        }
        $page = CmsPage::query()->where('tenant_id', $tenantId)->findOrFail($pageId);
        $ctx = [
            'id' => $page->id,
            'title' => $page->title,
            'slug' => $page->slug,
            'body' => $page->body,
            'page_prompt' => (string) ($payload['page_prompt'] ?? ''),
            'focus_keyword' => (string) ($payload['focus_keyword'] ?? ''),
        ];
        $result = $this->completeWithSeo($tenantId, 'page', $ctx, $this->prompts->pageSchema(),
            fn ($c) => $this->prompts->pageUser($tenantId, $c),
            fn ($data) => [(string) ($data['focus_keyword'] ?? ''), (string) ($data['body'] ?? ''), (string) ($data['title'] ?? $page->title)]
        );
        $this->writer->applyPage($tenantId, $pageId, $result['data']);
        $this->recordRun($tenantId, 'page', $pageId, (string) ($result['data']['focus_keyword'] ?? ''), (string) ($result['data']['title'] ?? $page->title), (string) ($result['data']['body'] ?? ''));

        return [
            'provider' => $result['provider'] ?? '',
            'model' => $result['model'] ?? '',
            'tokens_in' => $result['tokens_in'] ?? 0,
            'tokens_out' => $result['tokens_out'] ?? 0,
            'summary' => 'Page #'.$pageId.' updated',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobSuggestTopics(int $tenantId, array $payload): array
    {
        $s = AiContentSettings::get($tenantId);
        $ctx = [
            'site_topic' => $s['site_topic'],
            'site_name' => $s['site_name'],
            'count' => max(1, min(20, (int) ($payload['count'] ?? 5))),
        ];
        $result = $this->providers->complete(
            $tenantId,
            $this->prompts->system($tenantId),
            'Suggest blog topics as JSON.\n'.json_encode($ctx, JSON_UNESCAPED_UNICODE),
            $this->prompts->topicsSchema()
        );
        if (empty($result['ok'])) {
            throw new \RuntimeException((string) ($result['error'] ?? 'Topic suggest failed'));
        }
        $topics = $result['data']['topics'] ?? [];
        $existing = is_array($s['blog_topics'] ?? null) ? $s['blog_topics'] : [];
        foreach ($topics as $t) {
            if (! is_array($t)) {
                continue;
            }
            $existing[] = [
                'id' => uniqid('t_', true),
                'topic' => (string) ($t['topic'] ?? ''),
                'focus_keyword' => (string) ($t['focus_keyword'] ?? ''),
                'rationale' => (string) ($t['rationale'] ?? ''),
                'status' => 'pending',
            ];
        }
        AiContentSettings::save($tenantId, ['blog_topics' => $existing]);

        return [
            'provider' => $result['provider'] ?? '',
            'model' => $result['model'] ?? '',
            'tokens_in' => $result['tokens_in'] ?? 0,
            'tokens_out' => $result['tokens_out'] ?? 0,
            'summary' => count($topics).' topics suggested',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobTitleRewrite(int $tenantId, array $payload): array
    {
        $ids = array_map('intval', is_array($payload['product_ids'] ?? null) ? $payload['product_ids'] : []);
        $products = Product::query()->where('tenant_id', $tenantId)->whereIn('id', $ids)->with('brands')->get();
        $created = 0;
        foreach ($products as $p) {
            $brandName = $p->brands->first()?->name ?? '';
            $result = $this->providers->complete(
                $tenantId,
                $this->prompts->system($tenantId),
                'Propose a better product title JSON {"title":"..."}. Current: '.$p->name.' Brand: '.$brandName,
                ['title' => 'string']
            );
            if (empty($result['ok'])) {
                continue;
            }
            $title = (string) ($result['data']['title'] ?? '');
            if ($title === '' || $title === $p->name) {
                continue;
            }
            DB::table('ai_proposals')->updateOrInsert(
                ['tenant_id' => $tenantId, 'kind' => 'title', 'product_id' => $p->id],
                [
                    'current_json' => json_encode(['title' => $p->name], JSON_UNESCAPED_UNICODE),
                    'proposed_json' => json_encode(['title' => $title], JSON_UNESCAPED_UNICODE),
                    'status' => 'pending',
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
            $created++;
        }

        return ['summary' => $created.' title proposals', 'tokens_in' => 0, 'tokens_out' => 0];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function jobSuggestCategories(int $tenantId, array $payload): array
    {
        $ids = array_map('intval', is_array($payload['product_ids'] ?? null) ? $payload['product_ids'] : []);
        $cats = Category::query()->where('tenant_id', $tenantId)->get(['id', 'name']);
        $products = Product::query()->where('tenant_id', $tenantId)->whereIn('id', $ids)->get();
        $created = 0;
        foreach ($products as $p) {
            $result = $this->providers->complete(
                $tenantId,
                $this->prompts->system($tenantId),
                'Pick best category id for product. Product: '.$p->name."\nCategories:\n".json_encode($cats, JSON_UNESCAPED_UNICODE),
                ['category_id' => 'int', 'reason' => 'string']
            );
            if (empty($result['ok'])) {
                continue;
            }
            $cid = (int) ($result['data']['category_id'] ?? 0);
            if ($cid < 1 || ! $cats->contains('id', $cid)) {
                continue;
            }
            DB::table('ai_proposals')->updateOrInsert(
                ['tenant_id' => $tenantId, 'kind' => 'category', 'product_id' => $p->id],
                [
                    'current_json' => json_encode(['category_id' => $p->category_id], JSON_UNESCAPED_UNICODE),
                    'proposed_json' => json_encode(['category_id' => $cid, 'reason' => $result['data']['reason'] ?? ''], JSON_UNESCAPED_UNICODE),
                    'status' => 'pending',
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
            $created++;
        }

        return ['summary' => $created.' category proposals', 'tokens_in' => 0, 'tokens_out' => 0];
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array<string, mixed>  $schema
     * @param  callable(array): string  $userFn
     * @param  callable(array): array{0:string,1:string,2:string}  $seoParts  focus, body, title
     * @return array<string, mixed>
     */
    private function completeWithSeo(int $tenantId, string $entity, array $ctx, array $schema, callable $userFn, callable $seoParts): array
    {
        $last = null;
        for ($i = 0; $i < 2; $i++) {
            $result = $this->providers->complete(
                $tenantId,
                $this->prompts->system($tenantId),
                $userFn($ctx).($i > 0 ? "\n\nPrevious SEO issues: ".implode('; ', $last['errors'] ?? []).'. Fix them.' : ''),
                $schema
            );
            if (empty($result['ok'])) {
                throw new \RuntimeException((string) ($result['error'] ?? 'AI failed'));
            }
            $data = $result['data'] ?? [];
            [$focus, $body, $title] = $seoParts($data);
            $gate = $this->seo->validate($tenantId, $entity, array_merge($data, ['focus_keyword' => $focus]), $title, $body);
            if ($gate['ok']) {
                return $result;
            }
            $last = $gate;
            $ctx['regenerate_hint'] = implode('; ', $gate['errors']);
        }
        // Accept last attempt even if soft-failing gate (matches WP soft path after retries).
        return $result ?? throw new \RuntimeException('SEO gate failed: '.implode('; ', $last['errors'] ?? []));
    }

    private function recordRun(int $tenantId, string $type, int $id, string $focus, string $title, string $body): void
    {
        DB::table('ai_runs')->insert([
            'tenant_id' => $tenantId,
            'target_type' => $type,
            'target_id' => $id,
            'focus_keyword' => mb_substr($focus, 0, 255),
            'title_hash' => hash('sha256', mb_strtolower(trim($title))),
            'content_fingerprint' => hash('sha256', mb_substr(strip_tags($body), 0, 2000)),
            'created_at' => now(),
        ]);
    }

    /** @return array<string, mixed> */
    private function normalizeJob(object $row): array
    {
        $payload = $row->payload;
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        }

        return [
            'id' => (int) $row->id,
            'tenant_id' => (int) $row->tenant_id,
            'job_type' => (string) $row->job_type,
            'target_type' => (string) $row->target_type,
            'target_id' => (int) $row->target_id,
            'payload' => $payload,
            'status' => (string) $row->status,
            'provider' => (string) $row->provider,
            'model' => (string) $row->model,
            'tokens_in' => (int) $row->tokens_in,
            'tokens_out' => (int) $row->tokens_out,
            'cost_toman' => (float) $row->cost_toman,
            'error_message' => $row->error_message,
            'result_summary' => $row->result_summary,
            'attempts' => (int) $row->attempts,
            'created_at' => (string) $row->created_at,
            'updated_at' => (string) $row->updated_at,
            'started_at' => $row->started_at ? (string) $row->started_at : null,
            'finished_at' => $row->finished_at ? (string) $row->finished_at : null,
        ];
    }
}
