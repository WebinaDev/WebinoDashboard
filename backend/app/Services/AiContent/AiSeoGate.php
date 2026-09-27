<?php

namespace App\Services\AiContent;

final class AiSeoGate
{
    /**
     * @param  array<string, mixed>  $data
     * @return array{ok: bool, errors: list<string>}
     */
    public function validate(int $tenantId, string $entity, array $data, string $title = '', string $body = ''): array
    {
        $s = AiContentSettings::get($tenantId);
        $min = match ($entity) {
            'product' => (int) ($s['min_product_words'] ?? 200),
            'blog' => (int) ($s['min_blog_words'] ?? 400),
            'page' => (int) ($s['min_page_words'] ?? 100),
            default => (int) ($s['min_term_words'] ?? 100),
        };
        $errors = [];
        $text = trim(strip_tags($body !== '' ? $body : (string) ($data['description'] ?? $data['body'] ?? '')));
        $words = $this->wordCount($text);
        if ($words < $min) {
            $errors[] = "Content too short ({$words} words, min {$min})";
        }
        $kw = trim((string) ($data['focus_keyword'] ?? data_get($data, 'seo.focus_keyword', '')));
        $hay = mb_strtolower($title.' '.$text);
        if ($kw !== '' && ! str_contains($hay, mb_strtolower($kw))) {
            $errors[] = 'Focus keyword missing from title/body';
        }
        $links = $data['internal_links'] ?? [];
        if (is_array($links) && count($links) === 0 && in_array($entity, ['blog', 'product'], true)) {
            // Soft: do not fail — WP allows missing links after retries.
        }

        return ['ok' => $errors === [], 'errors' => $errors];
    }

    private function wordCount(string $text): int
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? '';
        if ($text === '') {
            return 0;
        }

        return count(preg_split('/\s+/u', $text) ?: []);
    }
}
