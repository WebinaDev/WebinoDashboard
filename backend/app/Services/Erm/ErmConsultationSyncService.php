<?php

namespace App\Services\Erm;

use App\Models\SiteConsultation;
use App\Models\Tenant;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ErmConsultationSyncService
{
    public function sync(SiteConsultation $consultation): bool
    {
        $consultation->loadMissing('tenant');
        $tenant = $consultation->tenant;
        if (! $tenant) {
            return false;
        }

        $baseUrl = rtrim((string) config('services.webino.base_url'), '/');
        if ($baseUrl === '') {
            return false;
        }

        $body = [
            'tenant_domain' => $tenant->domain,
            'crm_account_id' => $tenant->crm_account_id,
            'name' => $consultation->name,
            'email' => $consultation->email,
            'phone' => $consultation->phone,
            'subject' => $consultation->subject,
            'message' => $consultation->message,
            'site_consultation_id' => $consultation->id,
        ];

        $raw = json_encode($body, JSON_UNESCAPED_UNICODE);
        $token = (string) ($tenant->provision_token ?? '');
        $secret = (string) config('services.webino.provision_hmac_secret', '');
        if ($secret === '') {
            $secret = (string) config('services.webino.license_hmac_secret', '');
        }

        if ($secret === '' || $raw === false) {
            Log::warning('ERM consultation sync skipped: HMAC secret not configured', ['id' => $consultation->id]);

            return false;
        }

        if ($token === '') {
            Log::warning('ERM consultation sync skipped: missing site token', ['id' => $consultation->id]);

            return false;
        }

        $headers = [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'X-Site-Token' => $token,
            'X-Webino-Signature' => hash_hmac('sha256', $raw, $secret),
        ];

        try {
            $res = Http::timeout(20)
                ->withHeaders($headers)
                ->withBody($raw ?: '{}', 'application/json')
                ->post($baseUrl.'/api/webinocrm/v1/consultations/ingest');
        } catch (\Throwable $e) {
            Log::warning('ERM consultation sync failed', ['error' => $e->getMessage(), 'id' => $consultation->id]);

            return false;
        }

        if (! $res->successful()) {
            Log::warning('ERM consultation sync HTTP error', [
                'status' => $res->status(),
                'body' => $res->body(),
                'id' => $consultation->id,
            ]);

            return false;
        }

        $erpId = data_get($res->json(), 'data.consultation_id');
        if (! is_numeric($erpId)) {
            return false;
        }

        $consultation->update([
            'erp_consultation_id' => (int) $erpId,
            'synced_at' => now(),
            'meta' => array_merge($consultation->meta ?? [], ['sync_response' => $res->json('data')]),
        ]);

        return true;
    }
}
