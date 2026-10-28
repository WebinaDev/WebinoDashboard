<?php

namespace App\Services\Poetry;

use App\Models\MediaAsset;
use App\Models\Poetry\PoetryMedia;
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
            'has_media' => ! empty($p->media_ids) || ! empty($p->external_links) || (bool) $p->getAttribute('media_items_exists'),
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

        // Standalone media items linked to this poem (published + playable) join the legacy list.
        $links = array_values(array_filter((array) ($p->external_links ?? []), fn ($l) => is_array($l) && self::safeUrl($l['url'] ?? '')));
        $seen = array_flip(array_merge(array_column($media, 'url'), array_column($links, 'url')));
        foreach (PoetryMedia::query()->published()->playable()->with('asset')->where('poem_id', $p->id)->orderBy('sort')->orderBy('id')->get() as $m) {
            $row = self::media($m);
            if ($row['url'] && ! isset($seen[$row['url']])) {
                $media[] = ['id' => $m->id, 'url' => $row['url'], 'mime' => null, 'alt' => $m->title, 'kind' => $m->kind];
                $seen[$row['url']] = true;
            }
            if ($row['external_url'] && ! isset($seen[$row['external_url']])) {
                $links[] = ['label' => $m->title, 'url' => $row['external_url']];
                $seen[$row['external_url']] = true;
            }
        }

        return self::card($p) + [
            'melody_credit' => $p->melody_credit,
            'refrain_after_each' => (bool) $p->refrain_after_each,
            'stanzas' => $p->stanzas->map(fn ($s) => ['id' => $s->id, 'type' => $s->type, 'layout' => $s->layout, 'repeat' => $s->repeat, 'note' => $s->note, 'lines' => $s->lines])->all(),
            'sequence' => PoetryText::sequence($p),
            'media' => $media,
            'external_links' => $links,
            'seo' => $p->seo ?? (object) [],
        ];
    }

    /** Public/admin shape of a standalone media item. `url` = playable file, `embed_url` = iframe (Aparat). */
    public static function media(PoetryMedia $m): array
    {
        $asset = $m->media_id && $m->relationLoaded('asset') ? $m->asset : null;
        $file = trim((string) $m->file_url);
        if ($file === '' && $asset && (int) $asset->tenant_id === (int) $m->tenant_id) {
            $file = (string) $asset->url;
        }
        $file = $file !== '' && (self::safeUrl($file) || str_starts_with($file, '/')) ? $file : null;
        $ext = trim((string) $m->external_url);
        $ext = $ext !== '' && self::safeUrl($ext) ? $ext : null;

        return [
            'id' => $m->id, 'title' => $m->title, 'kind' => in_array($m->kind, PoetryMedia::KINDS, true) ? $m->kind : 'audio',
            'url' => $file, 'external_url' => $ext, 'embed_url' => $ext ? self::embedUrl($ext) : null,
            'cover' => $m->cover ?: null, 'reciter' => $m->reciter, 'duration' => $m->duration,
            'occasion' => $m->relationLoaded('occasion') ? self::term($m->occasion) : null,
            'poem' => $m->relationLoaded('poem') && $m->poem ? ['id' => $m->poem->id, 'slug' => $m->poem->slug, 'title' => $m->poem->title] : null,
            'media_id' => $m->media_id, 'file_url' => $m->file_url, 'occasion_id' => $m->occasion_id, 'poem_id' => $m->poem_id,
            'sort' => (int) $m->sort, 'status' => $m->status, 'play_count' => (int) $m->play_count,
        ];
    }

    /** Aparat watch links → official iframe embed; others (Eitaa/Telegram posts) have no embed → null. */
    public static function embedUrl(string $url): ?string
    {
        if (preg_match('#^https?://(?:www\.)?aparat\.com/(?:v|video/video/embed/videohash)/([A-Za-z0-9]+)#i', $url, $m)) {
            return 'https://www.aparat.com/video/video/embed/videohash/'.$m[1].'/vt/frame';
        }

        return null;
    }

    public static function safeUrl(string $u): bool
    {
        return (bool) preg_match('#^https?://#i', $u);
    }
}
