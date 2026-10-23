<?php

namespace App\Services\Poetry;

use App\Models\MediaAsset;
use App\Models\Poetry\PoetryPoem;
use App\Models\Poetry\PoetryTerm;

class PoetryPresenter
{
    public static function term(?PoetryTerm $t): ?array
    {
        return $t ? ['id' => $t->id, 'kind' => $t->kind, 'slug' => $t->slug, 'name' => $t->name, 'description' => $t->description, 'image' => $t->image] : null;
    }

    public static function card(PoetryPoem $p): array
    {
        $terms = $p->relationLoaded('terms') ? $p->terms : collect();

        return [
            'id' => $p->id, 'slug' => $p->slug, 'title' => $p->title, 'excerpt' => $p->excerpt,
            'occasion' => self::term($p->occasion), 'meter' => self::term($p->meter), 'style_label' => $p->style_label,
            'figures' => $terms->where('kind', 'figure')->values()->map(fn ($t) => self::term($t))->all(),
            'styles' => $terms->where('kind', 'style')->values()->map(fn ($t) => self::term($t))->all(),
            'pen_name' => $p->pen_name, 'composed_label' => $p->composed_label, 'flags' => $p->flags ?? (object) [],
            'view_count' => $p->view_count, 'published_at' => $p->published_at?->toIso8601String(),
            'has_media' => ! empty($p->media_ids) || ! empty($p->external_links),
        ];
    }

    public static function full(PoetryPoem $p): array
    {
        $media = [];
        $ids = array_values(array_filter(array_map('intval', (array) ($p->media_ids ?? []))));
        if ($ids) {
            $media = MediaAsset::query()->where('tenant_id', $p->tenant_id)->whereIn('id', $ids)->get()
                ->map(fn ($m) => ['id' => $m->id, 'url' => $m->url, 'mime' => $m->mime, 'alt' => $m->alt,
                    'kind' => str_starts_with((string) $m->mime, 'video') ? 'video' : (str_starts_with((string) $m->mime, 'audio') ? 'audio' : 'file')])->all();
        }

        return self::card($p) + [
            'melody_credit' => $p->melody_credit,
            'refrain_after_each' => (bool) $p->refrain_after_each,
            'stanzas' => $p->stanzas->map(fn ($s) => ['id' => $s->id, 'type' => $s->type, 'layout' => $s->layout, 'repeat' => $s->repeat, 'note' => $s->note, 'lines' => $s->lines])->all(),
            'sequence' => PoetryText::sequence($p),
            'media' => $media,
            'external_links' => array_values(array_filter((array) ($p->external_links ?? []), fn ($l) => is_array($l) && self::safeUrl($l['url'] ?? ''))),
            'seo' => $p->seo ?? (object) [],
        ];
    }

    public static function safeUrl(string $u): bool
    {
        return (bool) preg_match('#^https?://#i', $u);
    }
}
