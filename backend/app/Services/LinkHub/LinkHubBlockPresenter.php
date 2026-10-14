<?php

namespace App\Services\LinkHub;

use App\Models\LinkHubBlock;
use App\Services\Modules\ModuleSettingsService;

/**
 * Shapes block payloads for the public page: strips unsafe URLs, validates map
 * coordinates and resolves opening hours from the cafe module when asked.
 * Returns null when a block has nothing renderable.
 */
final class LinkHubBlockPresenter
{
    public const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    public function __construct(private readonly ModuleSettingsService $settings) {}

    /** @return array<string, mixed>|null */
    public function present(LinkHubBlock $block): ?array
    {
        $p = is_array($block->payload) ? $block->payload : [];

        return match ($block->type) {
            'form' => [
                'title' => $p['title'] ?? 'فرم',
                'description' => $this->text($p['description'] ?? null, 500),
                'submit_label' => $p['submit_label'] ?? 'ارسال',
                'success_message' => $this->text($p['success_message'] ?? null, 300),
                'fields' => is_array($p['fields'] ?? null) ? $p['fields'] : [
                    ['name' => 'name', 'label' => 'نام', 'type' => 'text', 'required' => true],
                    ['name' => 'phone', 'label' => 'موبایل', 'type' => 'tel', 'required' => true],
                    ['name' => 'message', 'label' => 'پیام', 'type' => 'textarea', 'required' => false],
                ],
            ],
            'link' => $this->link($p),
            'contact' => $this->contact($p),
            'event' => array_merge($p, ['cta_url' => LinkHubTheme::safeUrl($p['cta_url'] ?? null)]),
            'cta' => $this->cta($p),
            'section' => $this->section($p),
            'image' => $this->image($p),
            'gallery' => $this->gallery($p),
            'map' => $this->map($p),
            'hours' => $this->hours((int) $block->tenant_id, $p),
            default => $p,
        };
    }

    /** @return array<string, mixed> */
    private function link(array $p): array
    {
        return array_merge($p, ['url' => LinkHubTheme::safeUrl($p['url'] ?? null) ?? '#']);
    }

    /** @return array<string, mixed> */
    private function contact(array $p): array
    {
        $socials = [];
        foreach (is_array($p['socials'] ?? null) ? $p['socials'] : [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $url = LinkHubTheme::safeUrl($row['url'] ?? null);
            if ($url === null) {
                continue;
            }
            $socials[] = array_filter([
                'label' => $this->text($row['label'] ?? null, 80),
                'url' => $url,
                'value' => $this->text($row['value'] ?? null, 120),
                'network' => $this->text($row['network'] ?? null, 32),
            ], fn ($v) => $v !== null);
        }

        $phones = [];
        foreach (is_array($p['phones'] ?? null) ? $p['phones'] : [] as $row) {
            $value = is_array($row) ? $this->text($row['value'] ?? null, 40) : null;
            if ($value === null) {
                continue;
            }
            $phones[] = array_filter([
                'label' => $this->text($row['label'] ?? null, 80),
                'value' => $value,
                'whatsapp' => ! empty($row['whatsapp']) ? true : null,
            ], fn ($v) => $v !== null);
        }

        return [
            'title' => $this->text($p['title'] ?? null, 120),
            'phone' => $this->text($p['phone'] ?? null, 40),
            'email' => $this->text($p['email'] ?? null, 160),
            'phones' => $phones,
            'socials' => $socials,
        ];
    }

    /** @return array<string, mixed>|null */
    private function cta(array $p): ?array
    {
        $url = LinkHubTheme::safeUrl($p['url'] ?? null);
        $label = $this->text($p['label'] ?? null, 80);
        if ($url === null || $label === null) {
            return null;
        }
        $variant = in_array($p['variant'] ?? null, ['primary', 'secondary', 'chip'], true) ? $p['variant'] : 'primary';

        return [
            'label' => $label,
            'sublabel' => $this->text($p['sublabel'] ?? null, 120),
            'url' => $url,
            'icon' => $this->text($p['icon'] ?? null, 32) ?? 'link',
            'variant' => $variant,
        ];
    }

    /** @return array<string, mixed>|null */
    private function section(array $p): ?array
    {
        $title = $this->text($p['title'] ?? null, 120);

        return $title === null ? null : ['title' => $title, 'subtitle' => $this->text($p['subtitle'] ?? null, 240)];
    }

    /** @return array<string, mixed>|null */
    private function image(array $p): ?array
    {
        $src = LinkHubTheme::safeImage($p['url'] ?? null);
        if ($src === null) {
            return null;
        }

        return [
            'url' => $src,
            'alt' => $this->text($p['alt'] ?? null, 200) ?? '',
            'caption' => $this->text($p['caption'] ?? null, 240),
            'href' => LinkHubTheme::safeUrl($p['href'] ?? null),
        ];
    }

    /** @return array<string, mixed>|null */
    private function gallery(array $p): ?array
    {
        $images = [];
        foreach (is_array($p['images'] ?? null) ? $p['images'] : [] as $row) {
            $src = is_array($row) ? LinkHubTheme::safeImage($row['url'] ?? null) : null;
            if ($src === null) {
                continue;
            }
            $images[] = [
                'url' => $src,
                'alt' => $this->text($row['alt'] ?? null, 200) ?? '',
                'caption' => $this->text($row['caption'] ?? null, 240),
            ];
            if (count($images) >= 24) {
                break;
            }
        }
        if ($images === []) {
            return null;
        }

        return [
            'title' => $this->text($p['title'] ?? null, 120),
            'layout' => in_array($p['layout'] ?? null, ['grid', 'carousel'], true) ? $p['layout'] : 'grid',
            'images' => $images,
        ];
    }

    /** @return array<string, mixed>|null */
    private function map(array $p): ?array
    {
        $lat = is_numeric($p['lat'] ?? null) ? (float) $p['lat'] : null;
        $lng = is_numeric($p['lng'] ?? null) ? (float) $p['lng'] : null;
        if ($lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180 || ($lat == 0.0 && $lng == 0.0)) {
            return null;
        }
        $zoom = is_numeric($p['zoom'] ?? null) ? max(3, min(19, (int) $p['zoom'])) : 16;

        return [
            'title' => $this->text($p['title'] ?? null, 120),
            'address' => $this->text($p['address'] ?? null, 300),
            'lat' => round($lat, 7),
            'lng' => round($lng, 7),
            'zoom' => $zoom,
            'directions_url' => LinkHubTheme::safeUrl($p['directions_url'] ?? null),
        ];
    }

    /** @return array<string, mixed>|null */
    private function hours(int $tenantId, array $p): ?array
    {
        $source = ($p['source'] ?? 'manual') === 'cafe' ? 'cafe' : 'manual';
        $timezone = 'Asia/Tehran';
        $raw = is_array($p['days'] ?? null) ? $p['days'] : [];

        if ($source === 'cafe') {
            $cafe = $this->settings->get($tenantId, 'cafe', 'hours');
            if (is_array($cafe['days'] ?? null) && $cafe['days'] !== []) {
                $raw = $cafe['days'];
                $timezone = is_string($cafe['timezone'] ?? null) && $cafe['timezone'] !== '' ? $cafe['timezone'] : $timezone;
            }
        }

        $byDay = [];
        foreach ($raw as $row) {
            if (is_array($row) && in_array($row['day'] ?? null, self::DAYS, true)) {
                $byDay[$row['day']] = $row;
            }
        }
        if ($byDay === []) {
            return null;
        }

        $days = [];
        foreach (self::DAYS as $day) {
            $row = $byDay[$day] ?? null;
            $open = $this->time($row['open'] ?? null);
            $close = $this->time($row['close'] ?? null);
            $closed = (bool) ($row['closed'] ?? false);
            // Missing or zero-length ranges are unknown, not "open all day".
            $known = $row !== null && ($closed || ($open !== null && $close !== null && $open !== $close));
            $days[] = [
                'day' => $day,
                'open' => $known && ! $closed ? $open : null,
                'close' => $known && ! $closed ? $close : null,
                'closed' => $known && $closed,
                'known' => $known,
            ];
        }

        return [
            'title' => $this->text($p['title'] ?? null, 120) ?? 'ساعت کاری',
            'note' => $this->text($p['note'] ?? null, 300),
            'source' => $source,
            'timezone' => $timezone,
            'days' => $days,
        ];
    }

    private function time(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) ? $value : null;
    }

    private function text(mixed $value, int $max): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }
        $value = trim(strip_tags((string) $value));

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
