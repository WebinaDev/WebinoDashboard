<?php

namespace App\Services\Poetry;

/**
 * Parses poems pasted from Telegram/Eitaa channels into a reviewable structure:
 * blocks separated by «...» lines; decorative lines, emoji and the 🆔 handle are dropped;
 * header lines (تیتر:, فضای تیتر, style, status flags) and the signature/date footer go into fields.
 * Nothing is saved here.
 */
class PoetryImportParser
{
    private const MONTHS = 'فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند|محرم|صفر';

    private const STYLE_WORDS = 'نوحه|سینه‌زنی|سینه زنی|زنجیرزنی|زنجیر زنی|زمینه|واحد|شور|روضه|سرود|مناجات|دکلمه|مدح';

    public function parse(string $raw): array
    {
        $raw = str_replace(["\r\n", "\r"], "\n", $raw);
        $out = ['title' => null, 'pen_name' => null, 'composed_label' => null, 'melody_credit' => null, 'style_label' => null,
            'flags' => ['is_new' => false, 'not_performed' => false, 'rewritten' => false], 'stanzas' => [], 'warnings' => []];

        $blocks = [[]];
        foreach (explode("\n", $raw) as $line) {
            if (preg_match('/^\s*(\.{3,}|…+)\s*$/u', $line)) {
                $blocks[] = [];
                continue;
            }
            if (preg_match('/🆔|(^|\s)@[A-Za-z0-9_]{3,}|t\.me\/|eitaa\.com\//u', $line)) {
                continue;
            }
            $clean = $this->stripDecor($line);
            if ($clean === '') {
                if ($blocks[count($blocks) - 1] !== []) {
                    $blocks[count($blocks) - 1][] = '';
                }
                continue;
            }
            $blocks[count($blocks) - 1][] = $clean;
        }

        $blocks = array_values(array_filter(array_map(fn ($b) => $this->trimBlank($b), $blocks)));

        // Header metadata in the first block.
        if ($blocks) {
            $first = [];
            foreach ($blocks[0] as $l) {
                if ($this->takeMeta($l, $out, true)) {
                    continue;
                }
                $first[] = $l;
            }
            $blocks[0] = $this->trimBlank($first);
        }
        // Footer metadata in the last block.
        if ($blocks) {
            $lastIdx = count($blocks) - 1;
            $last = $blocks[$lastIdx];
            while ($last && ($this->takeFooter(end($last), $out) || end($last) === '')) {
                array_pop($last);
            }
            $blocks[$lastIdx] = $last;
        }
        $blocks = array_values(array_filter($blocks));

        $refrainText = null;
        foreach ($blocks as $i => $lines) {
            $type = 'stanza';
            $repeat = 1;
            $kept = [];
            foreach ($lines as $l) {
                if (preg_match('/^(برگردان|بند\s*جواب|جواب|ترجیع(\s*بند)?)\s*[:：]?\s*$/u', $l)) {
                    $type = 'refrain';
                    continue;
                }
                if (preg_match('/^(تیتر)\s*[:：]?\s*$/u', $l)) {
                    $type = 'title';
                    continue;
                }
                if (preg_match('/^\(?\s*[x×*]\s*([0-9۰-۹]+)\s*\)?$|^\(?\s*([0-9۰-۹]+)\s*(بار|مرتبه)\s*\)?$/u', $l, $m)) {
                    $repeat = (int) $this->latinDigits($m[1] !== '' ? $m[1] : $m[2]);
                    continue;
                }
                if (preg_match('/^(.*?)\s*[\(\[]?\s*[x×]\s*([0-9۰-۹]+)\s*[\)\]]?$/u', $l, $m) && $m[1] !== '') {
                    $repeat = max($repeat, (int) $this->latinDigits($m[2]));
                    $l = $m[1];
                }
                if ($l !== '') {
                    $kept[] = $l;
                }
            }
            if (! $kept) {
                continue;
            }
            $joined = implode("\n", $kept);
            if ($type === 'stanza' && $refrainText !== null && $joined === $refrainText) {
                $type = 'refrain';
            }
            if ($type === 'stanza' && $i === 0 && count($blocks) > 1 && count($kept) <= 2) {
                $type = 'title';
            }
            if ($type === 'refrain') {
                $refrainText ??= $joined;
            }
            $out['stanzas'][] = ['type' => $type, 'layout' => count($kept) % 2 === 0 ? 'couplet' : 'single', 'repeat' => max(1, min(20, $repeat)), 'lines' => $kept];
        }

        // A block repeated verbatim later on is the refrain.
        if (! collect($out['stanzas'])->contains('type', 'refrain')) {
            $counts = array_count_values(array_map(fn ($s) => implode("\n", $s['lines']), $out['stanzas']));
            foreach ($out['stanzas'] as &$s) {
                if (($counts[implode("\n", $s['lines'])] ?? 0) > 1 && $s['type'] === 'stanza') {
                    $s['type'] = 'refrain';
                }
            }
            unset($s);
        }

        $titleStanza = collect($out['stanzas'])->firstWhere('type', 'title');
        $out['title'] = $titleStanza['lines'][0] ?? ($out['stanzas'][0]['lines'][0] ?? null);
        if (! $out['stanzas']) {
            $out['warnings'][] = 'متن شعری پیدا نشد.';
        }

        return $out;
    }

    private function takeMeta(string $l, array &$out, bool $header): bool
    {
        if (preg_match('/^(تیتر\s*[:：].+|فضای\s*تیتر.+|(سبک|ملودی|وزن)\s*[:：].+)$/u', $l)) {
            $out['melody_credit'] = trim($out['melody_credit'] ? $out['melody_credit'].' | '.$l : $l);

            return true;
        }
        $hit = false;
        foreach (['is_new' => '/#?جدید/u', 'not_performed' => '/خوانده\s*نشده/u', 'rewritten' => '/بازنویسی|بازسرایی/u'] as $flag => $re) {
            if (preg_match($re, $l) && mb_strlen($l) <= 40) {
                $out['flags'][$flag] = true;
                $hit = true;
            }
        }
        if ($hit) {
            return true;
        }
        if ($header && mb_strlen($l) <= 50 && preg_match('/^#?('.self::STYLE_WORDS.')/u', $l)) {
            $out['style_label'] = trim(str_replace(['#', '_'], ['', ' '], $l));

            return true;
        }

        return false;
    }

    private function takeFooter(string|false $l, array &$out): bool
    {
        if ($l === false || $l === '') {
            return false;
        }
        if (preg_match('/^('.self::MONTHS.')\s*(ماه\s*)?[0-9۰-۹]{2,4}$/u', $l) || preg_match('/^[0-9۰-۹]{4}\s*\/\s*[0-9۰-۹]{1,2}/u', $l)) {
            $out['composed_label'] ??= $l;

            return true;
        }
        $sig = trim(preg_replace('/^(#|شاعر\s*[:：]|سروده\s*[:：]?)/u', '', $l) ?? $l);
        if ($out['pen_name'] === null && preg_match('/^[\p{Arabic}\x{200C} ]{2,24}$/u', $sig) && count(preg_split('/\s+/u', $sig)) <= 3 && (str_starts_with($l, '#') || mb_strlen($sig) <= 8 || preg_match('/^(شاعر|سروده)/u', $l))) {
            $out['pen_name'] = $sig;

            return true;
        }
        if ($this->takeMeta($l, $out, false)) {
            return true;
        }

        return false;
    }

    private function stripDecor(string $line): string
    {
        // emoji, pictographs, dingbats, box drawing, variation selectors
        $l = preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2500}-\x{259F}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}\x{2700}-\x{27BF}\x{2022}\x{25A0}-\x{25FF}]/u', '', $line) ?? $line;
        $l = trim($l);
        if ($l !== '' && preg_match('/^[\s\-_=~*•·.:|<>«»\x{2014}\x{2013}]+$/u', $l) && ! preg_match('/^\.{3,}$/', $l)) {
            return '';
        }

        return preg_replace('/\s+/u', ' ', $l) ?? $l;
    }

    private function trimBlank(array $b): array
    {
        while ($b && $b[0] === '') {
            array_shift($b);
        }
        while ($b && end($b) === '') {
            array_pop($b);
        }

        return array_values(array_filter($b, fn ($l) => $l !== ''));
    }

    private function latinDigits(string $s): string
    {
        return strtr($s, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']);
    }
}
