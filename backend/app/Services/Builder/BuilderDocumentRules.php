<?php

namespace App\Services\Builder;

class BuilderDocumentRules
{
    /** @param  array<string, mixed>|null  $document */
    public static function normalize(?array $document): array
    {
        $document ??= ['version' => 1, 'sections' => []];
        $json = json_encode($document);
        abort_if($json === false || strlen($json) > 750000, 422, 'document too large');
        if (! isset($document['version'])) {
            $document['version'] = 1;
        }
        if (! isset($document['sections']) || ! is_array($document['sections'])) {
            $document['sections'] = [];
        }
        // Publish-time CSS from the editor: keep only a plain CSS string (no markup).
        if (isset($document['compiled'])) {
            $c = $document['compiled'];
            if (is_array($c) && is_string($c['css'] ?? null) && strlen($c['css']) <= 300000) {
                $document['compiled'] = [
                    'v' => (int) ($c['v'] ?? 0),
                    'bp' => preg_replace('/[^0-9\/]/', '', (string) ($c['bp'] ?? '')),
                    'hash' => preg_replace('/[^a-z0-9]/', '', (string) ($c['hash'] ?? '')),
                    'css' => str_replace(['<', '>'], ['', '>'], $c['css']),
                ];
            } else {
                unset($document['compiled']);
            }
        }

        return $document;
    }
}
