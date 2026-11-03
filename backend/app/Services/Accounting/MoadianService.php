<?php

namespace App\Services\Accounting;

use App\Models\AccInvoice;
use App\Models\AccMoadianJob;
use App\Services\Modules\ModuleSettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * سامانه مودیان — settings, packet build, submit, status (Dashboard-local).
 * Patterns aligned with WebinoERP MoadianClient + WP Accounting_Moadian.
 */
final class MoadianService
{
    public const SETTINGS_MODULE = 'settings';

    public const SETTINGS_KEY = 'shop.accounting.modian';

    public function __construct(private readonly ModuleSettingsService $settings) {}

    /**
     * @return array<string, mixed>
     */
    public function defaults(): array
    {
        return [
            'enabled' => false,
            'economic_code' => '',
            'national_id' => '',
            'fiscal_id' => '',
            'api_key' => '',
            'client_id' => '',
            'client_secret' => '',
            'private_key' => '',
            'base_url' => '',
            'hook_url' => '',
            'sandbox' => true,
            'sandbox_base_url' => 'https://sandbox.moadian.ir',
            'auto_send_on_sync' => false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getSettings(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, []);
        $merged = array_replace_recursive($this->defaults(), is_array($stored) ? $stored : []);

        return $this->publicSettings($merged);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function saveSettings(int $tenantId, array $payload): array
    {
        $prev = $this->settings->get($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, []);
        $prev = is_array($prev) ? $prev : [];
        $next = array_replace_recursive($this->defaults(), $prev);
        foreach ([
            'enabled', 'economic_code', 'national_id', 'fiscal_id', 'client_id',
            'base_url', 'hook_url', 'sandbox', 'sandbox_base_url', 'auto_send_on_sync',
        ] as $key) {
            if (array_key_exists($key, $payload)) {
                $next[$key] = $payload[$key];
            }
        }
        foreach (['api_key', 'client_secret', 'private_key'] as $secret) {
            if (array_key_exists($secret, $payload) && (string) $payload[$secret] !== '') {
                $next[$secret] = $payload[$secret];
            }
        }
        $this->settings->put($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, $next);

        return $this->publicSettings($next);
    }

    /**
     * @return array<string, mixed>
     */
    public function rawSettings(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, []);

        return array_replace_recursive($this->defaults(), is_array($stored) ? $stored : []);
    }

    public function enqueue(AccInvoice $invoice, string $action = 'send'): AccMoadianJob
    {
        $invoice->update(['moadian_status' => 'queued']);

        return AccMoadianJob::query()->create([
            'tenant_id' => $invoice->tenant_id,
            'invoice_id' => $invoice->id,
            'action' => $action,
            'status' => 'pending',
            'attempts' => 0,
            'run_after' => now(),
        ]);
    }

    public function processJob(AccMoadianJob $job): AccMoadianJob
    {
        $invoice = AccInvoice::query()->with('lines', 'person')->findOrFail($job->invoice_id);
        $cfg = $this->rawSettings((int) $job->tenant_id);
        $attempts = (int) $job->attempts + 1;

        if (empty($cfg['enabled'])) {
            return $this->failOrRetry($job, $invoice, $attempts, 'moadian_disabled');
        }

        $packet = $this->buildPacket($invoice, $cfg);
        $job->update([
            'attempts' => $attempts,
            'request_payload' => $packet,
            'status' => 'processing',
        ]);

        try {
            $result = $this->submitPacket($cfg, $packet);
        } catch (\Throwable $e) {
            return $this->failOrRetry($job, $invoice, $attempts, $e->getMessage(), $packet);
        }

        if (! ($result['ok'] ?? false)) {
            return $this->failOrRetry($job, $invoice, $attempts, (string) ($result['message'] ?? 'submit_failed'), $packet, $result['data'] ?? null);
        }

        $ref = (string) ($result['reference'] ?? '');
        $job->update([
            'status' => 'accepted',
            'reference_number' => $ref !== '' ? $ref : null,
            'response_payload' => $result['data'] ?? null,
            'last_error' => null,
            'processed_at' => now(),
            'run_after' => null,
        ]);
        $invoice->update([
            'moadian_status' => 'accepted',
            'moadian_reference' => $ref !== '' ? $ref : $invoice->moadian_reference,
            'moadian_sent_at' => now(),
        ]);

        return $job->fresh();
    }

    public function processDue(int $tenantId, int $limit = 10): array
    {
        $jobs = AccMoadianJob::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', ['pending', 'retry'])
            ->where(function ($q) {
                $q->whereNull('run_after')->orWhere('run_after', '<=', now());
            })
            ->orderBy('id')
            ->limit(max(1, min(50, $limit)))
            ->get();

        $processed = 0;
        $errors = [];
        foreach ($jobs as $job) {
            $processed++;
            $res = $this->processJob($job);
            if (in_array($res->status, ['failed', 'retry'], true) && $res->last_error) {
                $errors[] = $res->last_error;
            }
        }

        return ['processed' => $processed, 'errors' => $errors];
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return array<string, mixed>
     */
    public function buildPacket(AccInvoice $invoice, array $cfg): array
    {
        $buyer = is_array($invoice->buyer_tax) ? $invoice->buyer_tax : [];
        $person = $invoice->person;
        $items = [];
        $prdis = 0.0;
        $dis = 0.0;
        $adis = 0.0;
        $vam = 0.0;
        $bill = 0.0;

        foreach ($invoice->lines as $line) {
            $qty = (float) $line->qty;
            // Amounts stay in shop minor units (IRR rials) for packet fidelity.
            $fee = (int) $line->unit_price_minor;
            $discount = (int) $line->discount_minor;
            $before = round($qty * $fee, 2);
            $after = round(max(0, $before - $discount), 2);
            $vat = (float) $line->tax_minor;
            $lineTotal = round($after + $vat, 2);
            $prdis += $before;
            $dis += $discount;
            $adis += $after;
            $vam += $vat;
            $bill += $lineTotal;
            $items[] = [
                'sstid' => (string) ($line->sstid ?? ''),
                'sstt' => (string) $line->description,
                'mu' => '1627',
                'am' => $qty,
                'fee' => $fee,
                'prdis' => $before,
                'dis' => $discount,
                'adis' => $after,
                'vra' => (float) $line->vat_rate,
                'vam' => $vat,
                'tsstam' => $lineTotal,
            ];
        }

        $issued = $invoice->issue_date?->getTimestamp() ?: time();
        $buyerType = (($buyer['person_type'] ?? $buyer['type'] ?? '') === 'natural') ? 2 : 1;
        $tinb = (string) ($buyer['economic_code'] ?? $person?->economic_code ?? '');
        $bid = (string) ($buyer['national_id'] ?? $person?->national_id ?? '');

        return [
            'header' => [
                'taxid' => (string) ($invoice->meta['taxid'] ?? Str::upper(Str::random(22))),
                'indatim' => $issued * 1000,
                'inty' => 1,
                'inno' => (string) $invoice->number,
                'inp' => (int) ($invoice->moadian_pattern ?: 1),
                'ins' => 1,
                'tins' => (string) ($cfg['economic_code'] ?? ''),
                'tinb' => $tinb,
                'tob' => $buyerType,
                'bid' => $bid,
                'tprdis' => round($prdis, 2),
                'tdis' => round($dis, 2),
                'tadis' => round($adis, 2),
                'tvam' => round($vam, 2),
                'todam' => 0,
                'tbill' => round($bill, 2),
                'setm' => 1,
                'fiscal_id' => (string) ($cfg['fiscal_id'] ?? ''),
            ],
            'body' => $items,
            'payments' => [],
            'uid' => (string) Str::uuid(),
        ];
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @param  array<string, mixed>  $packet
     * @return array{ok: bool, message?: string, reference?: string, data?: mixed}
     */
    private function submitPacket(array $cfg, array $packet): array
    {
        $sandbox = (bool) ($cfg['sandbox'] ?? true);
        $base = rtrim((string) ($sandbox ? ($cfg['sandbox_base_url'] ?: $cfg['base_url']) : $cfg['base_url']), '/');
        $hook = trim((string) ($cfg['hook_url'] ?? ''));

        if ($base === '' && $hook === '') {
            // Local queue mode when credentials/endpoints are not set yet.
            return [
                'ok' => true,
                'reference' => 'LOCAL-'.Str::upper(Str::random(10)),
                'data' => ['mode' => 'queued_local', 'packet' => $packet],
            ];
        }

        $request = Http::timeout(25)->acceptJson();
        $apiKey = trim((string) ($cfg['api_key'] ?? ''));
        if ($apiKey !== '') {
            $request = $request->withToken($apiKey);
        }

        $body = ['payload' => $packet];
        $response = $base !== ''
            ? $request->post($base.'/invoices', $body)
            : $request->post($hook, $body);

        $json = $response->json();
        if (! $response->successful()) {
            return [
                'ok' => false,
                'message' => 'http_'.$response->status(),
                'data' => $json ?? $response->body(),
            ];
        }
        $ref = is_array($json) ? (string) ($json['referenceNumber'] ?? $json['uid'] ?? $json['reference'] ?? '') : '';

        return [
            'ok' => true,
            'reference' => $ref,
            'data' => $json,
        ];
    }

    private function failOrRetry(
        AccMoadianJob $job,
        AccInvoice $invoice,
        int $attempts,
        string $reason,
        ?array $packet = null,
        mixed $response = null,
    ): AccMoadianJob {
        $max = 5;
        $status = $attempts >= $max ? 'failed' : 'retry';
        $job->update([
            'status' => $status,
            'attempts' => $attempts,
            'last_error' => $reason,
            'request_payload' => $packet ?? $job->request_payload,
            'response_payload' => is_array($response) ? $response : ['raw' => $response],
            'run_after' => $status === 'retry' ? now()->addMinutes(2 ** min($attempts, 6)) : null,
            'processed_at' => $status === 'failed' ? now() : null,
        ]);
        $invoice->update(['moadian_status' => $status === 'failed' ? 'failed' : 'retry']);

        return $job->fresh();
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return array<string, mixed>
     */
    private function publicSettings(array $cfg): array
    {
        return [
            'enabled' => (bool) ($cfg['enabled'] ?? false),
            'economic_code' => (string) ($cfg['economic_code'] ?? ''),
            'national_id' => (string) ($cfg['national_id'] ?? ''),
            'fiscal_id' => (string) ($cfg['fiscal_id'] ?? ''),
            'client_id' => (string) ($cfg['client_id'] ?? ''),
            'base_url' => (string) ($cfg['base_url'] ?? ''),
            'hook_url' => (string) ($cfg['hook_url'] ?? ''),
            'sandbox' => (bool) ($cfg['sandbox'] ?? true),
            'sandbox_base_url' => (string) ($cfg['sandbox_base_url'] ?? ''),
            'auto_send_on_sync' => (bool) ($cfg['auto_send_on_sync'] ?? false),
            'api_key' => '',
            'client_secret' => '',
            'private_key' => '',
            'has_api_key' => trim((string) ($cfg['api_key'] ?? '')) !== '',
            'has_client_secret' => trim((string) ($cfg['client_secret'] ?? '')) !== '',
            'has_private_key' => trim((string) ($cfg['private_key'] ?? '')) !== '',
            'configured' => trim((string) ($cfg['economic_code'] ?? '')) !== ''
                || trim((string) ($cfg['api_key'] ?? '')) !== ''
                || trim((string) ($cfg['hook_url'] ?? '')) !== '',
        ];
    }
}
