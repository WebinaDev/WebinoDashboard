<?php

namespace App\Services\Builder;

use App\Models\BlogPost;
use App\Models\BuilderRevision;
use App\Models\BuilderTemplate;
use App\Models\CmsPage;
use Illuminate\Database\Eloquent\Model;

/**
 * Server-side history for builder documents. Every draft change is snapshotted; autosaves by the
 * same user within AUTOSAVE_WINDOW_MIN collapse into one row, and each target keeps at most KEEP rows.
 */
class BuilderRevisions
{
    public const KEEP = 50;

    public const AUTOSAVE_WINDOW_MIN = 10;

    /** target_type => [model class, draft column, published column] */
    public const TARGETS = [
        'page' => [CmsPage::class, 'builder_draft', 'builder_published'],
        'template' => [BuilderTemplate::class, 'draft', 'published'],
        'post' => [BlogPost::class, 'builder_draft', 'builder_published'],
    ];

    /** Set while a restore writes back, so the observer labels the snapshot correctly. */
    public static ?string $forcedReason = null;

    public static function register(): void
    {
        foreach (self::TARGETS as $type => [$class, $draft, $published]) {
            $class::saved(function (Model $model) use ($type, $draft, $published) {
                if ($model->wasChanged($draft) || ($model->wasRecentlyCreated && is_array($model->{$draft}))) {
                    self::record($type, $model, (array) $model->{$draft}, self::$forcedReason ?? (request()?->boolean('autosave') ? 'autosave' : 'save'));
                }
                if (! $model->wasRecentlyCreated && $model->wasChanged($published) && is_array($model->{$published})) {
                    self::record($type, $model, $model->{$published}, 'publish');
                }
            });
        }
    }

    /** @param  array<string, mixed>  $document */
    public static function record(string $type, Model $model, array $document, string $reason): void
    {
        $tenantId = (int) $model->getAttribute('tenant_id');
        $userId = auth()->id();
        $json = json_encode($document, JSON_UNESCAPED_UNICODE) ?: '{}';

        if ($reason === 'autosave') {
            $last = BuilderRevision::query()
                ->where('tenant_id', $tenantId)->where('target_type', $type)->where('target_id', $model->getKey())
                ->orderByDesc('id')->first();
            if ($last && $last->reason === 'autosave' && (int) $last->user_id === (int) $userId
                && $last->updated_at && $last->updated_at->gt(now()->subMinutes(self::AUTOSAVE_WINDOW_MIN))) {
                $last->update(['document' => $document, 'size' => strlen($json)]);

                return;
            }
        }

        BuilderRevision::query()->create([
            'tenant_id' => $tenantId,
            'target_type' => $type,
            'target_id' => $model->getKey(),
            'user_id' => $userId,
            'reason' => $reason,
            'document' => $document,
            'size' => strlen($json),
        ]);

        $stale = BuilderRevision::query()
            ->where('tenant_id', $tenantId)->where('target_type', $type)->where('target_id', $model->getKey())
            ->orderByDesc('id')->skip(self::KEEP)->take(1000)->pluck('id');
        if ($stale->isNotEmpty()) {
            BuilderRevision::query()->whereIn('id', $stale)->delete();
        }
    }

    public static function target(string $type, int $tenantId, int $id): Model
    {
        abort_unless(isset(self::TARGETS[$type]), 404);
        [$class] = self::TARGETS[$type];

        return $class::query()->where('tenant_id', $tenantId)->findOrFail($id);
    }
}
