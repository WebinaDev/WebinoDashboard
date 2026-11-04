<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreMediaRequest extends FormRequest
{
    /**
     * Safe media-library extensions only (no executables / HTML / scripts).
     * Images + PDF + SVG (sanitized) + common audio/video for poetry & content tenants.
     */
    public const ALLOWED_MIMES = [
        // images / docs
        'jpeg', 'jpg', 'png', 'webp', 'gif', 'pdf', 'svg',
        // audio
        'mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'oga',
        // video (+ webm also covers audio/webm containers)
        'mp4', 'webm', 'mov', 'm4v',
    ];

    public const ALLOWED_MIME_TYPES = [
        // images / docs (text/xml|plain only accepted for .svg — see withValidator)
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
        // audio
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/aac',
        'audio/x-m4a',
        'audio/m4a',
        'audio/ogg',
        'audio/opus',
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/webm',
        'application/ogg',
        // video
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-m4v',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $maxKb = max(1024, (int) config('media.max_upload_kb', 102400));

        return [
            'file' => [
                'required',
                'file',
                'max:'.$maxKb,
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
            // application/ogg is only for ogg/opus/oga audio containers.
            if ($mime === 'application/ogg' && ! in_array($ext, ['ogg', 'opus', 'oga'], true)) {
                $validator->errors()->add('file', 'Unsupported file type.');
            }
        });
    }
}
