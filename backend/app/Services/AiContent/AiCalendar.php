<?php

namespace App\Services\AiContent;

use Illuminate\Support\Facades\DB;

final class AiCalendar
{
    public function __construct(private readonly AiQueue $queue) {}

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function list(int $tenantId, ?string $from = null, ?string $to = null): array
    {
        $q = DB::table('ai_calendar')->where('tenant_id', $tenantId);
        if ($from) {
            $q->where('slot_date', '>=', $from);
        }
        if ($to) {
            $q->where('slot_date', '<=', $to);
        }
        $items = $q->orderBy('slot_date')->limit(200)->get()->map(fn ($r) => (array) $r)->all();

        return ['items' => $items, 'total' => count($items)];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function create(int $tenantId, array $data): array
    {
        $id = DB::table('ai_calendar')->insertGetId([
            'tenant_id' => $tenantId,
            'slot_date' => (string) ($data['slot_date'] ?? now()->toDateString()),
            'content_type' => (string) ($data['content_type'] ?? 'blog'),
            'topic' => (string) ($data['topic'] ?? ''),
            'focus_keyword' => (string) ($data['focus_keyword'] ?? ''),
            'secondary_keywords' => is_array($data['secondary_keywords'] ?? null)
                ? json_encode($data['secondary_keywords'], JSON_UNESCAPED_UNICODE)
                : (string) ($data['secondary_keywords'] ?? ''),
            'category_id' => (int) ($data['category_id'] ?? 0),
            'product_id' => (int) ($data['product_id'] ?? 0),
            'status' => 'planned',
            'notes' => (string) ($data['notes'] ?? ''),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return (array) DB::table('ai_calendar')->where('id', $id)->first();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function patch(int $tenantId, int $id, array $data): ?array
    {
        $row = DB::table('ai_calendar')->where('tenant_id', $tenantId)->where('id', $id)->first();
        if (! $row) {
            return null;
        }
        $upd = ['updated_at' => now()];
        foreach (['slot_date', 'content_type', 'topic', 'focus_keyword', 'status', 'notes'] as $k) {
            if (array_key_exists($k, $data)) {
                $upd[$k] = (string) $data[$k];
            }
        }
        foreach (['category_id', 'product_id'] as $k) {
            if (array_key_exists($k, $data)) {
                $upd[$k] = (int) $data[$k];
            }
        }
        if (array_key_exists('secondary_keywords', $data)) {
            $upd['secondary_keywords'] = is_array($data['secondary_keywords'])
                ? json_encode($data['secondary_keywords'], JSON_UNESCAPED_UNICODE)
                : (string) $data['secondary_keywords'];
        }
        DB::table('ai_calendar')->where('id', $id)->update($upd);

        return (array) DB::table('ai_calendar')->where('id', $id)->first();
    }

    public function delete(int $tenantId, int $id): bool
    {
        return DB::table('ai_calendar')->where('tenant_id', $tenantId)->where('id', $id)->delete() > 0;
    }

    public function runDue(int $tenantId): int
    {
        $today = now(config('app.timezone') === 'UTC' ? 'Asia/Tehran' : config('app.timezone'))->toDateString();
        $rows = DB::table('ai_calendar')
            ->where('tenant_id', $tenantId)
            ->where('status', 'planned')
            ->where('slot_date', '<=', $today)
            ->orderBy('slot_date')
            ->limit(10)
            ->get();
        $n = 0;
        foreach ($rows as $row) {
            $jobType = ($row->content_type ?? 'blog') === 'product' ? 'product_fill' : 'blog_write';
            $targetType = $jobType === 'product_fill' ? 'product' : 'calendar';
            $targetId = $jobType === 'product_fill' ? (int) $row->product_id : (int) $row->id;
            if ($targetId < 1 && $jobType === 'product_fill') {
                continue;
            }
            $jobId = $this->queue->enqueue($tenantId, $jobType, $targetType, $targetId, [
                'topic' => (string) $row->topic,
                'focus_keyword' => (string) $row->focus_keyword,
                'category_id' => (int) $row->category_id,
                'calendar_id' => (int) $row->id,
            ]);
            DB::table('ai_calendar')->where('id', $row->id)->update([
                'status' => 'queued',
                'job_id' => $jobId,
                'updated_at' => now(),
            ]);
            $n++;
        }

        return $n;
    }
}
