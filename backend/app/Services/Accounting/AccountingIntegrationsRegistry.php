<?php

namespace App\Services\Accounting;

use App\Services\Accounting\Adapters\ComingSoonAdapter;
use App\Services\Accounting\Adapters\HesabfaAdapter;
use App\Services\Modules\ModuleSettingsService;

final class AccountingIntegrationsRegistry
{
    public const SETTINGS_MODULE = 'settings';

    public const SETTINGS_KEY = 'shop.accounting.integrations';

    /** @var list<array{id:string,fa:string,en:string}> */
    public const MARKETPLACE = [
        ['id' => 'hesabfa', 'fa' => 'حسابفا', 'en' => 'Hesabfa'],
        ['id' => 'sepidar', 'fa' => 'سپیدار', 'en' => 'Sepidar'],
        ['id' => 'holoo', 'fa' => 'هلو', 'en' => 'Holoo'],
        ['id' => 'chortkeh', 'fa' => 'چرتکه', 'en' => 'Chortkeh'],
        ['id' => 'mahak', 'fa' => 'محک', 'en' => 'Mahak'],
        ['id' => 'ghiyas', 'fa' => 'قیاس', 'en' => 'Ghiyas'],
        ['id' => 'parmis', 'fa' => 'پارمیس', 'en' => 'Parmis'],
        ['id' => 'dasht', 'fa' => 'دشت', 'en' => 'Dasht'],
        ['id' => 'fardad', 'fa' => 'فرداد', 'en' => 'Fardad'],
        ['id' => 'rahkaran', 'fa' => 'راهکاران', 'en' => 'Rahkaran'],
        ['id' => 'peyvast', 'fa' => 'پیوست', 'en' => 'Peyvast'],
        ['id' => 'parsian', 'fa' => 'پارسیان', 'en' => 'Parsian'],
        ['id' => 'arian', 'fa' => 'آرین سیستم', 'en' => 'Arian System'],
        ['id' => 'tadbir', 'fa' => 'تدبیر', 'en' => 'Tadbir'],
        ['id' => 'arpa', 'fa' => 'آرپا', 'en' => 'Arpa'],
        ['id' => 'moein', 'fa' => 'معین', 'en' => 'Moein'],
        ['id' => 'mizan', 'fa' => 'میزان', 'en' => 'Mizan'],
        ['id' => 'asan', 'fa' => 'آسان', 'en' => 'Asan'],
    ];

    public function __construct(
        private readonly ModuleSettingsService $settings,
        private readonly HesabfaAdapter $hesabfa,
    ) {}

    public function adapter(string $id): AccountingAdapterInterface
    {
        if ($id === 'hesabfa') {
            return $this->hesabfa;
        }
        foreach (self::MARKETPLACE as $row) {
            if ($row['id'] === $id) {
                return new ComingSoonAdapter($row['id'], $row['fa'], $row['en']);
            }
        }

        return new ComingSoonAdapter($id, $id, $id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function hub(int $tenantId): array
    {
        $stored = $this->allSettings($tenantId);
        $out = [];
        foreach (self::MARKETPLACE as $row) {
            $adapter = $this->adapter($row['id']);
            $cfg = is_array($stored[$row['id']] ?? null) ? $stored[$row['id']] : [];
            $out[] = [
                'id' => $adapter->id(),
                'label_fa' => $adapter->labelFa(),
                'label_en' => $adapter->labelEn(),
                'status' => $adapter->status(),
                'coming_soon' => $adapter->status() !== 'live',
                'enabled' => (bool) ($cfg['enabled'] ?? false),
                'configured' => $this->isConfigured($adapter, $cfg),
                'settings_schema' => $adapter->settingsSchema(),
                'settings' => $this->publicSettings($adapter, $cfg),
                'marketplace_path' => '/dashboard/accounting/integrations',
            ];
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public function getSettings(int $tenantId, string $id): array
    {
        $all = $this->allSettings($tenantId);
        $cfg = is_array($all[$id] ?? null) ? $all[$id] : [];
        $adapter = $this->adapter($id);

        return $this->publicSettings($adapter, $cfg);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function saveSettings(int $tenantId, string $id, array $payload): array
    {
        $adapter = $this->adapter($id);
        $all = $this->allSettings($tenantId);
        $prev = is_array($all[$id] ?? null) ? $all[$id] : [];
        $schema = $adapter->settingsSchema();
        $next = $prev;
        foreach ($schema as $key => $meta) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }
            if (($meta['type'] ?? '') === 'password') {
                $val = (string) $payload[$key];
                if ($val !== '') {
                    $next[$key] = $val;
                }
                continue;
            }
            $next[$key] = $payload[$key];
        }
        if (array_key_exists('enabled', $payload)) {
            $next['enabled'] = (bool) $payload['enabled'];
        }
        $all[$id] = $next;
        $this->settings->put($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, $all);

        return $this->publicSettings($adapter, $next);
    }

    /**
     * @return array{ok: bool, message?: string, data?: mixed}
     */
    public function test(int $tenantId, string $id): array
    {
        $adapter = $this->adapter($id);
        if ($adapter->status() !== 'live') {
            return ['ok' => false, 'message' => 'coming_soon'];
        }
        $all = $this->allSettings($tenantId);
        $cfg = is_array($all[$id] ?? null) ? $all[$id] : [];

        return $adapter->testConnection($cfg);
    }

    /**
     * @return array{ok: bool, message?: string, remote_id?: string|null, data?: mixed}
     */
    public function pushInvoice(int $tenantId, string $id, array $invoicePayload): array
    {
        $adapter = $this->adapter($id);
        if ($adapter->status() !== 'live') {
            return ['ok' => false, 'message' => 'coming_soon'];
        }
        $all = $this->allSettings($tenantId);
        $cfg = is_array($all[$id] ?? null) ? $all[$id] : [];

        return $adapter->pushInvoice($cfg, $invoicePayload);
    }

    /**
     * @return array<string, mixed>
     */
    private function allSettings(int $tenantId): array
    {
        $stored = $this->settings->get($tenantId, self::SETTINGS_MODULE, self::SETTINGS_KEY, []);

        return is_array($stored) ? $stored : [];
    }

    /**
     * @param  array<string, mixed>  $cfg
     */
    private function isConfigured(AccountingAdapterInterface $adapter, array $cfg): bool
    {
        if ($adapter->id() === 'hesabfa') {
            return trim((string) ($cfg['api_key'] ?? '')) !== '';
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return array<string, mixed>
     */
    private function publicSettings(AccountingAdapterInterface $adapter, array $cfg): array
    {
        $out = ['enabled' => (bool) ($cfg['enabled'] ?? false)];
        foreach ($adapter->settingsSchema() as $key => $meta) {
            if ($key === 'enabled') {
                continue;
            }
            if (($meta['type'] ?? '') === 'password') {
                $out[$key] = '';
                $out['has_'.$key] = trim((string) ($cfg[$key] ?? '')) !== '';
                continue;
            }
            $out[$key] = $cfg[$key] ?? ($meta['default'] ?? null);
        }

        return $out;
    }
}
