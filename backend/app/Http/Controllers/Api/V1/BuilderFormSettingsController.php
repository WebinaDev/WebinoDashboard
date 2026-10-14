<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BuilderFormSetting;
use App\Services\Builder\BuilderFormActions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BuilderFormSettingsController extends Controller
{
    public function show(Request $request, string $key): JsonResponse
    {
        return response()->json(['data' => ['form_key' => $key, 'actions' => BuilderFormActions::settings((int) $request->user()->tenant_id, $key)]]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        \App\Services\Builder\BuilderAccess::authorize($request, 'edit');
        $data = $request->validate([
            'email_to' => ['nullable', 'string', 'max:500'],
            'sms_to' => ['nullable', 'string', 'regex:/^0?9\d{9}$/'],
            'sms_text' => ['nullable', 'string', 'max:300'],
            'webhook_url' => ['nullable', 'string', 'max:500'],
            'redirect_url' => ['nullable', 'string', 'max:500'],
        ]);
        $data = array_map(fn ($v) => trim((string) $v), $data);
        foreach (array_filter(explode(',', $data['email_to'] ?? '')) as $email) {
            if (! filter_var(trim($email), FILTER_VALIDATE_EMAIL)) {
                throw ValidationException::withMessages(['email_to' => 'ایمیل نامعتبر است.']);
            }
        }
        if (($data['webhook_url'] ?? '') !== '' && ! BuilderFormActions::webhookAllowed($data['webhook_url'])) {
            throw ValidationException::withMessages(['webhook_url' => 'وب‌هوک باید یک نشانی عمومی https باشد.']);
        }
        if (($data['redirect_url'] ?? '') !== '' && BuilderFormActions::safeRedirect($data['redirect_url']) === null) {
            throw ValidationException::withMessages(['redirect_url' => 'نشانی بازگشت نامعتبر است.']);
        }

        BuilderFormSetting::query()->updateOrCreate(
            ['tenant_id' => (int) $request->user()->tenant_id, 'form_key' => $key],
            ['actions' => array_intersect_key($data, array_flip(BuilderFormActions::KEYS))],
        );

        return $this->show($request, $key);
    }
}
