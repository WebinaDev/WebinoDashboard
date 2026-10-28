<?php

namespace App\Services\Seo;

use App\Models\SeoRedirect;
use App\Models\WordpressRedirect;
use Illuminate\Support\Collection;

final class SeoRedirectService
{
    public function normalizePath(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '/';
        }
        $parsed = parse_url($path, PHP_URL_PATH);
        $path = is_string($parsed) && $parsed !== '' ? $parsed : $path;
        if (! str_starts_with($path, '/')) {
            $path = '/'.$path;
        }
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        return $path;
    }

    /**
     * Manual SEO redirects win; otherwise fall back to WordPress-import permalinks/redirects
     * (old WP URLs → native paths) so a migrated store keeps its 301s.
     */
    public function find(int $tenantId, string $fromPath): SeoRedirect|WordpressRedirect|null
    {
        $from = $this->normalizePath($fromPath);

        $manual = SeoRedirect::query()
            ->where('tenant_id', $tenantId)
            ->where('enabled', true)
            ->where('from_path', $from)
            ->first();
        if ($manual !== null || $from === '/') {
            return $manual;
        }

        return $this->findImported($tenantId, $from);
    }

    private function findImported(int $tenantId, string $from): ?WordpressRedirect
    {
        $decoded = rawurldecode($from);
        $encoded = implode('/', array_map(fn ($seg) => rawurlencode($seg), explode('/', $decoded)));
        $variants = array_values(array_unique([$from, $from.'/', $decoded, $decoded.'/', $encoded, $encoded.'/']));

        $row = WordpressRedirect::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('from_path', $variants)
            ->orderByDesc('id')
            ->first();
        if ($row === null) {
            return null;
        }
        $to = $this->normalizePath((string) $row->to_path);
        // Root permalink stores (product_permalink_base = ''): /{slug} is itself canonical, never bounce it to /product/{slug}.
        if (str_starts_with($to, '/product/')) {
            $to = SeoSettingsService::productPathFor(app(SeoSettingsService::class)->get($tenantId), substr($to, strlen('/product/')));
        }
        if (rawurldecode($to) === $decoded || $to === '') {
            return null;
        }
        $row->to_path = $to;
        $row->status_code = in_array((int) $row->status_code, [301, 302, 307, 308], true) ? (int) $row->status_code : 301;

        return $row;
    }

    /** @return Collection<int, SeoRedirect> */
    public function list(int $tenantId): Collection
    {
        return SeoRedirect::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->limit(2000)
            ->get();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function upsert(int $tenantId, array $data, ?int $id = null): SeoRedirect
    {
        $from = $this->normalizePath((string) ($data['from_path'] ?? ''));
        $to = $this->normalizePath((string) ($data['to_path'] ?? ''));
        $code = (int) ($data['status_code'] ?? 301);
        if (! in_array($code, [301, 302, 307, 308], true)) {
            $code = 301;
        }
        if ($from === $to) {
            throw new \InvalidArgumentException('from_path and to_path must differ');
        }
        $payload = [
            'tenant_id' => $tenantId,
            'from_path' => $from,
            'to_path' => $to,
            'status_code' => $code,
            'enabled' => ($data['enabled'] ?? true) !== false,
            'note' => mb_substr((string) ($data['note'] ?? ''), 0, 255),
        ];
        if ($id) {
            $row = SeoRedirect::query()->where('tenant_id', $tenantId)->findOrFail($id);
            $row->fill($payload)->save();

            return $row->fresh();
        }

        return SeoRedirect::query()->updateOrCreate(
            ['tenant_id' => $tenantId, 'from_path' => $from],
            $payload
        );
    }

    public function delete(int $tenantId, int $id): void
    {
        SeoRedirect::query()->where('tenant_id', $tenantId)->where('id', $id)->delete();
    }
}
