<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderFormSubmission;
use App\Services\Builder\BuilderFormActions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class PublicBuilderFormController extends Controller
{
    public function submit(Request $request): \Illuminate\Http\JsonResponse
    {
        $tenantId = (int) $request->attributes->get('public_tenant_id');
        $key = 'builder_form:'.$tenantId.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 12)) {
            return response()->json(['message' => __('Too many submissions. Try again later.')], 429);
        }
        RateLimiter::hit($key, 60);

        $data = $request->validate([
            'form_key' => ['nullable', 'string', 'max:100'],
            'page_uri' => ['nullable', 'string', 'max:512'],
            'fields' => ['required', 'array', 'min:1', 'max:40'],
            'fields.*' => ['nullable', 'string', 'max:2000'],
            '_hp' => ['nullable', 'string', 'max:200'],
            '_t' => ['nullable', 'integer', 'min:0'],
        ]);

        // Anti-spam: honeypot filled or submitted faster than a human could → pretend success, store nothing.
        if (($data['_hp'] ?? '') !== '' || (isset($data['_t']) && (int) $data['_t'] < 1500)) {
            return response()->json(['data' => ['ok' => true]]);
        }

        $fields = [];
        foreach ($data['fields'] as $name => $value) {
            $cleanName = mb_substr(preg_replace('/[^\w.\-]/u', '', (string) $name) ?: 'field', 0, 80);
            $fields[$cleanName] = mb_substr(trim((string) $value), 0, 2000);
        }
        if ($fields === []) {
            return response()->json(['message' => __('No fields provided')], 422);
        }

        $ip = (string) ($request->ip() ?? '');
        $formKey = mb_substr((string) ($data['form_key'] ?? 'contact'), 0, 100);
        [$fields, $files] = BuilderFormFilesController::claim($tenantId, $formKey, $fields);
        $submission = BuilderFormSubmission::query()->create([
            'tenant_id' => $tenantId,
            'form_key' => $formKey,
            'page_uri' => mb_substr((string) ($data['page_uri'] ?? ''), 0, 512) ?: null,
            'payload' => $fields,
            'ip_hash' => $ip !== '' ? hash('sha256', $ip) : null,
        ]);

        foreach ($files as $file) {
            $file->submission_id = $submission->id;
            $file->save();
        }

        $result = BuilderFormActions::run($tenantId, $formKey, $fields);

        return response()->json(['data' => ['ok' => true, 'redirect' => $result['redirect']]]);
    }
}
