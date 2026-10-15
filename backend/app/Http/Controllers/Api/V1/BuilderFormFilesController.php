<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderFormFile;
use App\Models\BuilderFormSubmission;
use App\Services\Builder\BuilderAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Builder form file uploads (public, private disk) and the admin submissions inbox. */
class BuilderFormFilesController extends Controller
{
    /** Shared rule with WebinoERP (`FORM_UPLOAD_EXTENSIONS` / `FORM_UPLOAD_MAX_BYTES` in @webina/ui/builder). */
    public const MIMES = 'jpg,jpeg,png,webp,pdf,doc,docx,zip';

    public const MAX_KB = 10240;

    public function upload(Request $request, ?string $key = null): JsonResponse
    {
        if ($key !== null && ! $request->filled('form_key')) {
            $request->merge(['form_key' => $key]);
        }
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        $key = 'builder_form_upload:'.$tenantId.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 10)) {
            return response()->json(['message' => __('Too many uploads. Try again later.')], 429);
        }
        RateLimiter::hit($key, 60);
        $data = $request->validate([
            'file' => ['required', 'file', 'max:'.self::MAX_KB, 'mimes:'.self::MIMES],
            'form_key' => ['nullable', 'string', 'max:100'],
        ]);
        $file = $data['file'];
        $path = $file->store('builder-forms/'.$tenantId, 'local');
        abort_unless(is_string($path), 500, 'upload failed');
        $token = bin2hex(random_bytes(20));
        BuilderFormFile::query()->create([
            'tenant_id' => $tenantId,
            'form_key' => mb_substr((string) ($data['form_key'] ?? 'contact'), 0, 100),
            'token_hash' => hash('sha256', $token),
            'path' => $path,
            'original_name' => mb_substr(preg_replace('/[^\p{L}\p{N} ._()-]/u', '_', $file->getClientOriginalName()) ?: 'file', 0, 180),
            'mime' => (string) $file->getMimeType(),
            'size' => (int) $file->getSize(),
        ]);

        return response()->json(['data' => ['token' => 'upl_'.$token, 'name' => $file->getClientOriginalName(), 'size' => (int) $file->getSize()]], 201);
    }

    /**
     * Swaps upload tokens in submitted values for a readable reference and links the files to the submission.
     *
     * @param  array<string, string>  $fields
     * @return array{0: array<string, string>, 1: list<BuilderFormFile>}
     */
    public static function claim(int $tenantId, string $formKey, array $fields): array
    {
        $files = [];
        foreach ($fields as $name => $value) {
            if (! preg_match('/^upl_([a-f0-9]{40})$/', $value, $m)) {
                continue;
            }
            $row = BuilderFormFile::query()->where('tenant_id', $tenantId)->where('token_hash', hash('sha256', $m[1]))
                ->whereNull('submission_id')->where('created_at', '>=', now()->subDay())->first();
            if ($row && $row->form_key === $formKey) {
                $fields[$name] = '📎 '.$row->original_name;
                $files[] = $row;
            } else {
                $fields[$name] = '';
            }
        }

        return [$fields, $files];
    }

    /** Deletes uploads never attached to a submission (older than $hours); returns the number removed. */
    public static function purgeOrphans(int $hours = 24): int
    {
        $count = 0;
        BuilderFormFile::query()->whereNull('submission_id')->where('created_at', '<', now()->subHours($hours))
            ->orderBy('id')->chunkById(200, function ($rows) use (&$count) {
                foreach ($rows as $row) {
                    Storage::disk('local')->delete($row->path);
                    $row->delete();
                    $count++;
                }
            });

        return $count;
    }

    public function submissions(Request $request, string $key): JsonResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $tid = (int) $request->user()->tenant_id;
        $rows = BuilderFormSubmission::query()->where('tenant_id', $tid)->where('form_key', $key)->orderByDesc('id')->limit(100)->get();
        $files = BuilderFormFile::query()->where('tenant_id', $tid)->whereIn('submission_id', $rows->pluck('id'))->get()->groupBy('submission_id');

        return response()->json(['data' => $rows->map(fn ($r) => [
            'id' => $r->id,
            'payload' => $r->payload,
            'page_uri' => $r->page_uri,
            'created_at' => $r->created_at?->toIso8601String(),
            'files' => ($files->get($r->id) ?? collect())->map(fn ($f) => ['id' => $f->id, 'name' => $f->original_name, 'size' => $f->size])->values(),
        ])->values()]);
    }

    public function download(Request $request, int $file): StreamedResponse
    {
        BuilderAccess::authorize($request, 'edit');
        $row = BuilderFormFile::query()->where('tenant_id', $request->user()->tenant_id)->whereNotNull('submission_id')->findOrFail($file);
        abort_unless(Storage::disk('local')->exists($row->path), 404);

        return Storage::disk('local')->download($row->path, $row->original_name, ['X-Content-Type-Options' => 'nosniff']);
    }
}
