<?php

namespace App\Services\Payments\Drivers\Concerns;

trait BuildsFormBridge
{
    /**
     * Absolute bridge URL is filled later by checkout; drivers store relative path + form meta.
     * Checkout will rewrite redirect_url when meta has form_action.
     *
     * @param  array<string, string|int|float>  $fields
     * @return array{redirect_url: string, form_action: string, form_fields: array<string, string>, form_method: string}
     */
    protected function formBridgeMeta(string $action, array $fields, string $method = 'POST'): array
    {
        $normalized = [];
        foreach ($fields as $k => $v) {
            $normalized[(string) $k] = (string) $v;
        }

        return [
            'redirect_url' => 'form-bridge',
            'form_action' => $action,
            'form_fields' => $normalized,
            'form_method' => strtoupper($method) === 'GET' ? 'GET' : 'POST',
        ];
    }
}
