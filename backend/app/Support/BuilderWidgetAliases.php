<?php

namespace App\Support;

/**
 * Rewrites legacy builder widget type aliases inside saved builder documents.
 * Only the "type" key of nodes is touched; everything else is preserved verbatim.
 */
class BuilderWidgetAliases
{
    public const MAP = [
        'checkout-stub' => 'checkout',
        'account-stub' => 'account',
    ];

    /**
     * @return array{0: mixed, 1: int} rewritten document and number of replaced nodes
     */
    public static function migrate(mixed $doc): array
    {
        $count = 0;
        $map = self::MAP;
        $walkSections = function (mixed $sections) use (&$walkSections, &$count, $map): mixed {
            if (! is_array($sections)) {
                return $sections;
            }
            foreach ($sections as $sectionIndex => $section) {
                if (! is_array($section) || ! is_array($section['columns'] ?? null)) {
                    continue;
                }
                foreach ($section['columns'] as $columnIndex => $column) {
                    if (! is_array($column) || ! is_array($column['widgets'] ?? null)) {
                        continue;
                    }
                    foreach ($column['widgets'] as $widgetIndex => $widget) {
                        if (! is_array($widget)) {
                            continue;
                        }
                        $type = $widget['type'] ?? null;
                        if (is_string($type) && isset($map[$type])) {
                            $widget['type'] = $map[$type];
                            $count++;
                        }
                        if (array_key_exists('children', $widget)) {
                            $widget['children'] = $walkSections($widget['children']);
                        }
                        $section['columns'][$columnIndex]['widgets'][$widgetIndex] = $widget;
                    }
                }
                $sections[$sectionIndex] = $section;
            }

            return $sections;
        };

        if (is_array($doc) && array_key_exists('sections', $doc)) {
            $doc['sections'] = $walkSections($doc['sections']);
        }

        return [$doc, $count];
    }
}
