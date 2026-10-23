<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreMediaRequest extends FormRequest
{
    public const ALLOWED_MIMES = [
        'jpeg', 'jpg', 'png', 'webp', 'gif', 'pdf', 'svg',
    ];

    public const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'image/svg+xml',
        'image/svg',
        'text/xml',
        'application/xml',
        'text/plain',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'max:20480',
                'mimes:'.implode(',', self::ALLOWED_MIMES),
                'mimetypes:'.implode(',', self::ALLOWED_MIME_TYPES),
            ],
            'folder' => 'nullable|string|max:120',
            'folder_id' => 'nullable|integer',
            'category_ids' => 'nullable',
            'tag_ids' => 'nullable',
            'alt' => 'nullable|string|max:255',
            'title' => 'nullable|string|max:255',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $file = $this->file('file');
            if (! $file) {
                return;
            }
            $ext = strtolower((string) $file->getClientOriginalExtension());
            $mime = strtolower((string) ($file->getMimeType() ?: ''));
            // SVG is accepted only when it is a well-formed SVG; MediaController stores the sanitized copy.
            $isSvg = $ext === 'svg' || str_contains($mime, 'svg');
            if ($isSvg && (new \App\Services\Media\SvgSanitizer())->sanitize((string) @file_get_contents($file->getRealPath())) === null) {
                $validator->errors()->add('file', 'Invalid SVG file.');
            }
            // XML/plain-text mimetypes are only allowed for .svg files.
            if (! $isSvg && in_array($mime, ['text/xml', 'application/xml', 'text/plain'], true)) {
                $validator->errors()->add('file', 'Unsupported file type.');
            }
        });
    }
}
