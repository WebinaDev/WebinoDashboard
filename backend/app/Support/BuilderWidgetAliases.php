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
        $walk = function (mixed $node) use (&$walk, &$count): mixed {
            if (! is_array($node)) {
                return $node;
            }
            foreach ($node as $key => $value) {
                if ($key === 'type' && is_string($value) && isset(self::MAP[$value])) {
                    $node[$key] = self::MAP[$value];
                    $count++;
                } elseif (is_array($value)) {
                    $node[$key] = $walk($value);
                }
            }

            return $node;
        };

        return [$walk($doc), $count];
    }
}
