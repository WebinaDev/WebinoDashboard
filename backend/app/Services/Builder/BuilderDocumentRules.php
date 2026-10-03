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

        return $document;
    }
}
