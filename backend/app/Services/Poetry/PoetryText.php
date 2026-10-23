<?php

namespace App\Services\Poetry;

use App\Models\Poetry\PoetryPoem;

class PoetryText
{
    /** Normalise for search: Arabic ي/ك → ی/ک, drop diacritics, tatweel, ZWNJ → space, collapse spaces. */
    public static function normalize(string $s): string
    {
        $s = strtr($s, ['ي' => 'ی', 'ى' => 'ی', 'ك' => 'ک', 'ة' => 'ه', 'أ' => 'ا', 'إ' => 'ا', 'ؤ' => 'و', "\u{200C}" => ' ', 'ـ' => '']);
        $s = preg_replace('/[\x{064B}-\x{065F}\x{0670}]/u', '', $s) ?? $s;
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;

        return mb_strtolower(trim($s));
    }

    /**
     * Reading order: when refrain_after_each is on, the first refrain is repeated after
     * every following stanza that is not itself followed by a refrain.
     *
     * @return list<array{type:string,layout:string,repeat:int,lines:array,note:?string,auto?:bool}>
     */
    public static function sequence(PoetryPoem $poem): array
    {
        $stanzas = $poem->stanzas->map(fn ($s) => ['type' => $s->type, 'layout' => $s->layout, 'repeat' => (int) $s->repeat, 'lines' => $s->lines ?? [], 'note' => $s->note])->values()->all();
        if (! $poem->refrain_after_each) {
            return $stanzas;
        }
        $refrain = collect($stanzas)->firstWhere('type', 'refrain');
        if (! $refrain) {
            return $stanzas;
        }
        $out = [];
        $seenRefrain = false;
        foreach ($stanzas as $i => $s) {
            $out[] = $s;
            $seenRefrain = $seenRefrain || $s['type'] === 'refrain';
            $next = $stanzas[$i + 1] ?? null;
            if ($seenRefrain && $s['type'] === 'stanza' && ($next['type'] ?? null) !== 'refrain') {
                $out[] = $refrain + ['auto' => true];
            }
        }

        return $out;
    }

    public static function plain(PoetryPoem $poem): string
    {
        $parts = [$poem->title];
        foreach (self::sequence($poem) as $s) {
            $block = implode("\n", $s['lines']);
            if ($s['repeat'] > 1) {
                $block .= "\n(×".$s['repeat'].')';
            }
            $parts[] = $block;
        }
        $foot = array_filter([$poem->pen_name, $poem->composed_label]);
        if ($foot) {
            $parts[] = implode(' — ', $foot);
        }

        return implode("\n\n", $parts)."\n";
    }
}
