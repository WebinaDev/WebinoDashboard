<?php

namespace App\Services\WordpressImport;

use App\Models\Order;
use Carbon\Carbon;
use DateTimeInterface;
use InvalidArgumentException;

final class WordpressImportMapper
{
    /** @var list<string> */
    private const ZERO_DECIMAL = ['IRR', 'IRT', 'JPY', 'KRW', 'VND'];

    public function toMinor(array $payload, string $key, string $currency, float $multiplier): int
    {
        $minorKey = $key.'_minor';
        if (array_key_exists($minorKey, $payload) && $payload[$minorKey] !== null && $payload[$minorKey] !== '') {
            return max(0, (int) round((float) $payload[$minorKey]));
        }
        if (! array_key_exists($key, $payload) || $payload[$key] === null || $payload[$key] === '') {
            return 0;
        }

        $scale = in_array(strtoupper($currency), self::ZERO_DECIMAL, true) ? 1 : 100;
        $factor = $multiplier > 0 ? $multiplier : 1;

        return max(0, (int) round(((float) $payload[$key]) * $scale * $factor));
    }

    public function orderStatus(string $raw): string
    {
        $key = strtolower(trim(str_replace([' ', '_'], '-', $raw)));

        $mapped = match ($key) {
            'pending', 'pending-payment', 'checkout-draft' => 'pending_payment',
            'on-hold' => 'on_hold',
            'processing' => 'processing',
            'completed', 'complete' => 'completed',
            'cancelled', 'canceled' => 'cancelled',
            'refunded' => 'refunded',
            'failed' => 'failed',
            'shipped' => 'shipped',
            'paid' => 'paid',
            default => null,
        };

        if ($mapped !== null) {
            return $mapped;
        }

        return in_array($raw, Order::STATUSES, true) ? $raw : 'processing';
    }

    public function productStatus(string $raw): string
    {
        return match (strtolower(trim($raw))) {
            'publish', 'published' => 'publish',
            'trash', 'deleted' => 'trash',
            default => 'draft',
        };
    }

    public function contentPublished(string $raw): bool
    {
        return in_array(strtolower(trim($raw)), ['publish', 'published'], true);
    }

    public function slug(?string $slug, string $fallback, int $max = 180): string
    {
        $raw = trim((string) (($slug !== null && trim($slug) !== '') ? $slug : $fallback));
        $raw = rawurldecode($raw);
        $raw = preg_replace('/\s+/u', '-', $raw) ?? '';
        $raw = preg_replace('/[^\p{L}\p{N}\-_]+/u', '', (string) $raw) ?? '';
        $raw = trim((string) $raw, '-_');
        $raw = mb_substr($raw, 0, $max);

        return $raw !== '' ? $raw : 'item';
    }

    public function date(mixed $value): ?Carbon
    {
        if ($value instanceof DateTimeInterface) {
            return Carbon::instance(\DateTime::createFromInterface($value));
        }
        if (is_int($value) || (is_string($value) && ctype_digit($value))) {
            $ts = (int) $value;

            return $ts > 0 ? Carbon::createFromTimestamp($ts) : null;
        }
        if (is_array($value)) {
            $value = $value['date'] ?? $value['date_created'] ?? null;
        }
        if (! is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    public function sanitizeHtml(string $html): string
    {
        $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html) ?? $html;
        $html = preg_replace('/<(iframe|object|embed)\b[^>]*>.*?<\/\1>/is', '', $html) ?? $html;
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? $html;
        $html = preg_replace('/javascript\s*:/i', '', $html) ?? $html;

        return $html;
    }

    /** @return array<string, mixed> */
    public function htmlDocument(string $externalId, string $title, string $html): array
    {
        $id = $this->safeId($externalId);
        $widgets = [];
        if (trim($title) !== '') {
            $widgets[] = [
                'id' => 'w_title_'.$id,
                'type' => 'heading',
                'props' => ['text' => $title, 'tag' => 'h1'],
            ];
        }
        $widgets[] = [
            'id' => 'w_html_'.$id,
            'type' => 'html',
            'props' => ['html' => mb_substr($this->sanitizeHtml($html), 0, 500000)],
        ];

        return [
            'version' => 1,
            'sections' => [[
                'id' => 'sec_wp_'.$id,
                'columns' => [[
                    'id' => 'col_wp_'.$id,
                    'span' => 12,
                    'widgets' => $widgets,
                ]],
            ]],
        ];
    }

    /**
     * @param  array<string, mixed>  $document
     * @return array<string, mixed>
     */
    public function mergeNavigation(array $document, string $kind, string $links): array
    {
        if (! isset($document['version'])) {
            $document['version'] = 1;
        }
        if (! isset($document['sections']) || ! is_array($document['sections'])) {
            $document['sections'] = [];
        }

        $updated = false;
        $walk = function (array &$nodes) use (&$walk, &$updated, $kind, $links): void {
            foreach ($nodes as &$node) {
                if (! is_array($node)) {
                    continue;
                }
                $type = (string) ($node['type'] ?? '');
                $match = $type === 'menu' || ($kind === 'header' && $type === 'store-header');
                if ($match) {
                    $props = is_array($node['props'] ?? null) ? $node['props'] : [];
                    $props['links'] = $this->mergeLinkLines((string) ($props['links'] ?? ''), $links);
                    $node['props'] = $props;
                    $updated = true;
                }
                foreach (['columns', 'widgets', 'children'] as $childKey) {
                    if (isset($node[$childKey]) && is_array($node[$childKey])) {
                        $walk($node[$childKey]);
                    }
                }
            }
        };
        $walk($document['sections']);

        if (! $updated && trim($links) !== '') {
            $id = substr(sha1($kind.'|'.$links), 0, 8);
            $document['sections'][] = [
                'id' => 'sec_wp_nav_'.$id,
                'columns' => [[
                    'id' => 'col_wp_nav_'.$id,
                    'span' => 12,
                    'widgets' => [[
                        'id' => 'w_wp_nav_'.$id,
                        'type' => 'menu',
                        'props' => ['links' => $links],
                    ]],
                ]],
            ];
        }

        return $document;
    }

    public function mergeLinkLines(string $existing, string $incoming): string
    {
        $lines = [];
        foreach (preg_split("/\r\n|\n|\r/", $existing."\n".$incoming) ?: [] as $line) {
            $line = trim((string) $line);
            if ($line === '' || ! str_contains($line, '|')) {
                continue;
            }
            [$label, $url] = array_pad(explode('|', $line, 2), 2, '');
            $label = trim($label);
            $url = trim($url);
            if ($label === '' || $url === '') {
                continue;
            }
            $lines[$url] = $label.'|'.$url;
        }

        return implode("\n", array_values($lines));
    }

    /**
     * @param  list<array<string, mixed>>  $items
     */
    public function menuLinks(array $items, ?string $sourceHost): string
    {
        $lines = [];
        $this->flattenMenu($items, $lines, $sourceHost, '');

        return implode("\n", $lines);
    }

    public function safeHref(string $url, ?string $sourceHost): string
    {
        $url = trim($url);
        if ($url === '' || preg_match('/^(javascript|data|vbscript):/i', $url)) {
            return '';
        }
        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return mb_substr($url, 0, 500);
        }
        if (! preg_match('#^https?://#i', $url)) {
            return '';
        }
        try {
            $parts = ImportUrlGuard::parseHttp($url);
        } catch (InvalidArgumentException) {
            return '';
        }
        if ($sourceHost !== null && $parts['host'] === strtolower($sourceHost)) {
            $path = $parts['path'] !== '' ? $parts['path'] : '/';

            return mb_substr($path, 0, 500);
        }

        return mb_substr($url, 0, 500);
    }

    public function addressLine(mixed $value): ?string
    {
        if (is_string($value)) {
            $line = trim($value);

            return $line === '' ? null : mb_substr($line, 0, 2000);
        }
        if (! is_array($value)) {
            return null;
        }
        $parts = [];
        foreach (['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'phone'] as $key) {
            if (! empty($value[$key]) && is_scalar($value[$key])) {
                $parts[] = trim((string) $value[$key]);
            }
        }
        if ($parts === [] && isset($value['line']) && is_scalar($value['line'])) {
            $parts[] = trim((string) $value['line']);
        }
        $line = trim(implode('، ', array_filter($parts)));

        return $line === '' ? null : mb_substr($line, 0, 2000);
    }

    public function safeId(string $externalId): string
    {
        $id = preg_replace('/[^\p{L}\p{N}\-_]+/u', '', $externalId) ?? '';
        $id = mb_substr((string) $id, 0, 40);

        return $id !== '' ? $id : substr(sha1($externalId), 0, 10);
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @param  list<string>  $lines
     */
    private function flattenMenu(array $items, array &$lines, ?string $sourceHost, string $prefix): void
    {
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $label = trim((string) ($item['label'] ?? $item['title'] ?? $item['name'] ?? ''));
            $full = trim($prefix.$label);
            $href = $this->safeHref((string) ($item['url'] ?? $item['href'] ?? ''), $sourceHost);
            if ($full !== '' && $href !== '') {
                $lines[] = $full.'|'.$href;
            }
            $children = $item['children'] ?? $item['items'] ?? [];
            if (is_array($children) && $children !== []) {
                $this->flattenMenu($children, $lines, $sourceHost, $full !== '' ? $full.' / ' : '');
            }
        }
    }
}
