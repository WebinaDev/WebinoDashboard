<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreMediaRequest extends FormRequest
{
    public const ALLOWED_MIMES = [
        'jpeg', 'jpg', 'png', 'webp', 'gif', 'pdf',
    ];

    public const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
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
            // SVG is never accepted (scriptable); block by extension/mime even if validation drifts.
            if ($ext === 'svg' || str_contains($mime, 'svg')) {
                $validator->errors()->add('file', 'SVG uploads are not allowed.');
            }
        });
    }
}
