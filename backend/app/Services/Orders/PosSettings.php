<?php

namespace App\Services\Orders;

use App\Services\Modules\ModuleSettingsService;

/**
 * Tenant POS + pay-link settings (payment tenders, card readers, customer wizard fields).
 */
class PosSettings
{
    public const MODULE = 'commerce';

    public const SUB = 'pos';

    /** @var list<string> */
    public const TENDER_IDS = [
        'cash',
        'card_to_card',
        'pos_terminal',
        'online',
        'wallet',
        'payment_sms',
        'other',
    ];

    /** @var list<string> */
    public const PAY_LINK_FIELD_KEYS = [
        'customer_name',
        'customer_phone',
        'customer_email',
        'province',
        'city',
        'address',
        'plaque',
        'unit',
        'postcode',
        'shipping_method',
        'qty_edit',
    ];

    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    public function defaults(): array
    {
        $methods = [];
        foreach (self::TENDER_IDS as $id) {
            $type = match ($id) {
                'online', 'payment_sms' => 'online',
                'pos_terminal' => 'terminal',
                default => 'offline',
            };
            $methods[] = [
                'id' => $id,
                'enabled' => ! in_array($id, ['wallet', 'other'], true),
                'label' => '',
                'type' => $type,
                // Empty = all enabled site gateways; set in settings to map subset.
                'gateway_ids' => [],
            ];
        }

        $fields = [];
        foreach (self::PAY_LINK_FIELD_KEYS as $key) {
            $fields[$key] = [
                'visible' => true,
                'required' => in_array($key, ['customer_phone', 'address', 'city', 'province'], true),
                'customer_editable' => ! in_array($key, ['customer_phone'], true),
            ];
        }

        return [
            'payment_methods' => $methods,
            'card_readers' => [],
            'pay_link_fields' => $fields,
            'pay_link_send_sms' => true,
            'auto_create_customer' => true,
            // Customer /pay offline gateways (card_to_card, wallet, cod, …).
            'offline_instructions' => [
                'card_to_card' => '',
                'wallet' => '',
                'cod' => '',
                'cash' => '',
                'other' => '',
            ],
        ];
    }

    /**
     * Customer-facing instructions for an offline pay-link gateway.
     */
    public function offlineInstructionsFor(int $tenantId, string $gatewayId): string
    {
        $id = str_replace('-', '_', strtolower(trim($gatewayId)));
        if ($id === 'c2c') {
            $id = 'card_to_card';
        }
        $map = $this->get($tenantId)['offline_instructions'] ?? [];
        if (! is_array($map)) {
            return '';
        }
        $text = trim((string) ($map[$id] ?? ''));
        if ($text !== '') {
            return $text;
        }
        // Fall back to payment-method custom label's sibling instructions key if ever set on method.
        foreach ($this->get($tenantId)['payment_methods'] ?? [] as $m) {
            if (! is_array($m) || (string) ($m['id'] ?? '') !== $id) {
                continue;
            }

            return trim((string) ($m['instructions'] ?? ''));
        }

        return '';
    }

    /** @return array<string, mixed> */
    public function get(int $tenantId): array
    {
        $raw = $this->settings->get($tenantId, self::MODULE, self::SUB, $this->defaults());

        return $this->normalize($raw);
    }

    /** @param  array<string, mixed>  $payload */
    public function put(int $tenantId, array $payload): array
    {
        $merged = $this->normalize(array_merge($this->get($tenantId), $payload));
        $this->settings->put($tenantId, self::MODULE, self::SUB, $merged);

        return $merged;
    }

    /**
     * Enabled POS tender ids (cash, pos_terminal, …) for the register UI.
     *
     * @return list<array{id: string, label: string, type: string, enabled: bool}>
     */
    public function enabledTenders(int $tenantId): array
    {
        return array_values(array_filter(
            $this->get($tenantId)['payment_methods'] ?? [],
            fn ($m) => is_array($m) && ! empty($m['enabled'])
        ));
    }

    /**
     * Named card readers / POS terminals.
     *
     * @return list<array{id: string, name: string, enabled: bool}>
     */
    public function cardReaders(int $tenantId): array
    {
        $rows = $this->get($tenantId)['card_readers'] ?? [];

        return is_array($rows) ? array_values(array_filter($rows, fn ($r) => is_array($r))) : [];
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    protected function normalize(array $raw): array
    {
        $defaults = $this->defaults();
        $methodsById = [];
        foreach ($defaults['payment_methods'] as $m) {
            $methodsById[$m['id']] = $m;
        }
        foreach ($raw['payment_methods'] ?? [] as $m) {
            if (! is_array($m) || empty($m['id']) || ! isset($methodsById[$m['id']])) {
                continue;
            }
            $id = (string) $m['id'];
            $type = (string) ($m['type'] ?? $methodsById[$id]['type']);
            $gatewayIds = [];
            if ($type === 'online' && isset($m['gateway_ids']) && is_array($m['gateway_ids'])) {
                foreach ($m['gateway_ids'] as $gid) {
                    $gid = str_replace('-', '_', strtolower(trim((string) $gid)));
                    if ($gid !== '') {
                        $gatewayIds[] = $gid;
                    }
                }
                $gatewayIds = array_values(array_unique($gatewayIds));
            }
            $methodsById[$id] = [
                'id' => $id,
                'enabled' => (bool) ($m['enabled'] ?? $methodsById[$id]['enabled']),
                'label' => (string) ($m['label'] ?? ''),
                'type' => $type,
                'gateway_ids' => $gatewayIds,
            ];
        }

        $fields = $defaults['pay_link_fields'];
        foreach ($raw['pay_link_fields'] ?? [] as $key => $cfg) {
            if (! is_string($key) || ! isset($fields[$key]) || ! is_array($cfg)) {
                continue;
            }
            $fields[$key] = [
                'visible' => (bool) ($cfg['visible'] ?? $fields[$key]['visible']),
                'required' => (bool) ($cfg['required'] ?? $fields[$key]['required']),
                'customer_editable' => (bool) ($cfg['customer_editable'] ?? $fields[$key]['customer_editable']),
            ];
        }

        $readers = [];
        foreach ($raw['card_readers'] ?? [] as $r) {
            if (! is_array($r)) {
                continue;
            }
            $id = trim((string) ($r['id'] ?? ''));
            $name = trim((string) ($r['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            if ($id === '') {
                $id = 'reader_'.substr(sha1($name.microtime(true)), 0, 8);
            }
            $readers[] = [
                'id' => $id,
                'name' => $name,
                'enabled' => (bool) ($r['enabled'] ?? true),
            ];
        }

        $offlineDefaults = $defaults['offline_instructions'];
        $offline = $offlineDefaults;
        foreach ($raw['offline_instructions'] ?? [] as $key => $text) {
            if (! is_string($key)) {
                continue;
            }
            $id = str_replace('-', '_', strtolower(trim($key)));
            if ($id === 'c2c') {
                $id = 'card_to_card';
            }
            if ($id === '' || ! array_key_exists($id, $offlineDefaults)) {
                // Allow extra keys (future offline providers).
                if ($id === '') {
                    continue;
                }
            }
            $offline[$id] = mb_substr(trim((string) $text), 0, 4000);
        }

        return [
            'payment_methods' => array_values($methodsById),
            'card_readers' => $readers,
            'pay_link_fields' => $fields,
            'pay_link_send_sms' => array_key_exists('pay_link_send_sms', $raw)
                ? (bool) $raw['pay_link_send_sms']
                : true,
            'auto_create_customer' => array_key_exists('auto_create_customer', $raw)
                ? (bool) $raw['auto_create_customer']
                : true,
            'offline_instructions' => $offline,
        ];
    }
}
