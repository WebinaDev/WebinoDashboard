<?php

namespace App\Services\Media;

use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * Allow-list SVG sanitizer for media uploads. Drops scriptable/embedding elements, every on* handler,
 * and any href/src/style that points at javascript:, data: (except raster images) or external URLs.
 * Returns null when the input is not a well-formed SVG document.
 */
class SvgSanitizer
{
    private const BLOCKED_ELEMENTS = [
        'script', 'foreignobject', 'iframe', 'embed', 'object', 'audio', 'video', 'handler', 'listener',
        'set', 'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'meta', 'link', 'base',
    ];

    public function sanitize(string $svg): ?string
    {
        if ($svg === '' || stripos($svg, '<svg') === false || preg_match('/<!DOCTYPE|<!ENTITY/i', $svg)) {
            return null;
        }
        $prev = libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        $ok = $doc->loadXML($svg, LIBXML_NONET | LIBXML_NOBLANKS);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        if (! $ok || ! $doc->documentElement || strtolower($doc->documentElement->localName) !== 'svg') {
            return null;
        }
        $xp = new DOMXPath($doc);
        $remove = [];
        foreach ($xp->query('//*') as $el) {
            /** @var DOMElement $el */
            if (in_array(strtolower($el->localName), self::BLOCKED_ELEMENTS, true)) {
                $remove[] = $el;
                continue;
            }
            $drop = [];
            foreach ($el->attributes as $attr) {
                $name = strtolower($attr->localName);
                $val = strtolower(preg_replace('/[\s\x00-\x1f]+/', '', (string) $attr->value) ?? '');
                if (str_starts_with($name, 'on')) {
                    $drop[] = $attr;
                } elseif (in_array($name, ['href', 'src'], true)
                    && ! str_starts_with($val, '#')
                    && ! preg_match('#^data:image/(png|jpe?g|gif|webp);#', $val)) {
                    $drop[] = $attr;
                } elseif (str_contains($val, 'javascript:') || ($name === 'style' && (str_contains($val, 'url(') && ! str_contains($val, 'url(#')))) {
                    $drop[] = $attr;
                }
            }
            foreach ($drop as $a) {
                $el->removeAttributeNode($a);
            }
        }
        foreach ($remove as $el) {
            $el->parentNode?->removeChild($el);
        }
        foreach ($xp->query('//*[local-name()="style"]') as $st) {
            if (preg_match('/@import|javascript:|expression\(|url\((?!\s*[\'"]?#)/i', (string) $st->textContent)) {
                $st->parentNode?->removeChild($st);
            }
        }
        foreach ($xp->query('//processing-instruction()') as $pi) {
            $pi->parentNode?->removeChild($pi);
        }

        return $doc->saveXML($doc->documentElement) ?: null;
    }
}
