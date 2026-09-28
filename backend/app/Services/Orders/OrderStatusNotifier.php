<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\Tenant;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Sms\ModirPayamakClient;

/**
 * Notify customer on order status changes (in-app, email, SMS, bots) via the notification dispatcher.
 */
class OrderStatusNotifier
{
    public function __construct(
        protected NotificationDispatcher $dispatcher,
    ) {}

    public function notify(Order $order, string $fromStatus, string $toStatus, array $extra = []): void
    {
        if ($fromStatus === $toStatus && empty($extra['force'])) {
            return;
        }

        $label = OrderShippingStatuses::label($toStatus, app()->getLocale() === 'en' ? 'en' : 'fa');
        $tracking = $order->trackingCode() ?? '';
        $vars = array_merge([
            'order_number' => (string) ($order->number ?? $order->id),
            'status_label' => $label,
            'tracking_code' => $tracking,
            'return_reason' => (string) ($extra['return_reason'] ?? ''),
            'return_amount' => (string) ($extra['return_amount'] ?? ''),
        ], $extra);

        $title = __('orders.notify_title', ['number' => $vars['order_number']], app()->getLocale());
        $body = __('orders.notify_body', [
            'number' => $vars['order_number'],
            'status' => $vars['status_label'],
            'tracking' => $vars['tracking_code'],
        ], app()->getLocale());

        if ($title === 'orders.notify_title') {
            $title = 'Order #'.$vars['order_number'];
        }
        if ($body === 'orders.notify_body') {
            $body = 'Status: '.$vars['status_label'].($tracking !== '' ? ' — tracking '.$tracking : '');
        }

        $smsBody = strtr(
            'Order {order_number}: {status_label}'.($tracking !== '' ? ' Tracking: {tracking_code}' : ''),
            [
                '{order_number}' => $vars['order_number'],
                '{status_label}' => $vars['status_label'],
                '{tracking_code}' => $vars['tracking_code'],
            ]
        );

        $only = null;
        if (! empty($extra['sms_only'])) {
            $only = ['sms'];
        } elseif (! empty($extra['email_only'])) {
            $only = ['email'];
        }
        $skip = OrderShippingStatuses::smsEventFor($toStatus) ? [] : ['sms'];

        $scalarVars = array_filter($vars, fn ($v) => is_scalar($v) || $v === null);

        $this->dispatcher->dispatch('order_status', (int) $order->tenant_id, [
            'vars' => array_merge($scalarVars, [
                'status' => $vars['status_label'],
                'customer_name' => (string) ($order->customer_name ?? ''),
            ]),
            'type' => 'order_status',
            'customer_user_id' => $order->user_id ? (int) $order->user_id : null,
            'customer_email' => (string) ($order->customer_email ?? ''),
            'customer_phone' => (string) ($order->customer_phone ?? ''),
            'customer_link' => '/dashboard/account/orders/'.$order->id,
            'admin_link' => '/dashboard/orders/'.$order->id,
            'customer_title' => $title,
            'customer_body' => $body,
            'sms_body' => $smsBody,
            'only' => $only,
            'skip' => $skip,
        ]);
    }

    public function appendHistory(Order $order, string $from, string $to, ?int $byUserId = null): void
    {
        $meta = is_array($order->meta) ? $order->meta : [];
        $history = is_array($meta['status_history'] ?? null) ? $meta['status_history'] : [];
        $history[] = [
            'from' => $from,
            'to' => $to,
            'at' => now()->toIso8601String(),
            'by' => $byUserId,
        ];
        $meta['status_history'] = array_slice($history, -50);
        $order->meta = $meta;
        $order->save();
    }

    /**
     * Send the order SMS for an event using the store's registered pattern/template.
     *
     * @param  array<string, mixed>  $input  event_key, order, force_customer, force_admin, role, phone
     * @return array{ok: bool, event_key: string|null, results: list<array<string, mixed>>, reason?: string}
     */
    public function sendOrderSms(Tenant $tenant, ?Order $order, array $input, bool $test = false): array
    {
        $eventKey = trim((string) ($input['event_key'] ?? ''));
        if ($eventKey === '' && $order) {
            $eventKey = (string) (OrderShippingStatuses::smsEventFor((string) $order->status) ?? '');
        }
        if ($eventKey === '') {
            return ['ok' => false, 'event_key' => null, 'results' => [], 'reason' => 'no_event'];
        }

        $client = app(ModirPayamakClient::class);
        $shop = $client->get($tenant, 'settings/shop');
        $shopData = $shop['ok'] && is_array($shop['data']) && empty($shop['data']['unavailable']) ? $shop['data'] : [];
        $settings = is_array($shopData['settings'] ?? null) ? $shopData['settings'] : [];

        $registry = $shopData['registry'] ?? null;
        if (! is_array($registry)) {
            $reg = $client->get($tenant, 'patterns/registry');
            $registry = $reg['ok'] && is_array($reg['data']['registry'] ?? null) ? $reg['data']['registry'] : [];
        }
        $tpl = $client->get($tenant, 'templates');
        $templates = $tpl['ok'] && is_array($tpl['data']['templates'] ?? null) ? $tpl['data']['templates'] : [];

        $vars = $this->smsVars($tenant, $order, is_array($input['order'] ?? null) ? $input['order'] : [], $eventKey);
        $adminPhones = array_values(array_filter(array_map(
            fn ($p) => is_scalar($p) ? trim((string) $p) : '',
            is_array($settings['admin_phones'] ?? null) ? $settings['admin_phones'] : []
        )));

        $targets = [];
        if ($test) {
            $role = ($input['role'] ?? 'customer') === 'admin' ? 'admin' : 'customer';
            $phone = trim((string) ($input['phone'] ?? ''));
            if ($phone === '') {
                $phone = $role === 'admin' ? ($adminPhones[0] ?? '') : (string) ($vars['customer_phone'] ?? '');
            }
            if ($phone !== '') {
                $targets[] = [$role, $phone];
            }
        } else {
            $toggle = is_array($settings['events'][$eventKey] ?? null) ? $settings['events'][$eventKey] : [];
            $customerOn = ! empty($input['force_customer']) || (bool) ($toggle['customer'] ?? true);
            $adminOn = ! empty($input['force_admin']) || (bool) ($toggle['admin'] ?? $adminPhones !== []);
            if ($customerOn && filled($vars['customer_phone'] ?? null)) {
                $targets[] = ['customer', (string) $vars['customer_phone']];
            }
            if ($adminOn) {
                foreach ($adminPhones as $phone) {
                    $targets[] = ['admin', $phone];
                }
            }
        }

        if ($targets === []) {
            return ['ok' => false, 'event_key' => $eventKey, 'results' => [], 'reason' => 'no_recipients'];
        }

        $results = [];
        foreach ($targets as [$role, $phone]) {
            $scope = 'order_'.$role;
            $reg = collect($registry)->first(fn ($r) => is_array($r) && ($r['scope'] ?? '') === $scope && ($r['event_key'] ?? '') === $eventKey);
            $template = collect($templates)->first(fn ($t) => is_array($t)
                && ($t['scope'] ?? '') === $scope
                && ($t['event_key'] ?? '') === $eventKey
                && filter_var($t['enabled'] ?? true, FILTER_VALIDATE_BOOLEAN));

            $patternCode = trim((string) ($reg['ippanel_code'] ?? $template['pattern_code'] ?? ''));
            $body = trim((string) ($template['body'] ?? ''));
            if ($body === '') {
                $body = 'Order {order_number}: {status_label}'.(($vars['tracking_code'] ?? '') !== '' ? ' Tracking: {tracking_code}' : '');
            }
            $message = $this->renderSms($body, $vars);

            $payload = ['message' => $message, 'recipients' => [$phone]];
            if ($patternCode !== '') {
                $paramMap = $reg['param_map'] ?? $template['param_map'] ?? null;
                $params = [];
                if (is_array($paramMap) && $paramMap !== []) {
                    foreach ($paramMap as $param => $varKey) {
                        $params[(string) $param] = (string) ($vars[(string) $varKey] ?? $varKey);
                    }
                } else {
                    $params = $vars;
                }
                $payload['sending_type'] = 'pattern';
                $payload['code'] = $patternCode;
                $payload['pattern_code'] = $patternCode;
                $payload['params'] = $params;
            }

            $res = $client->post($tenant, 'send', $payload);
            $data = is_array($res['data']) ? $res['data'] : [];
            $ok = $res['ok'] && ($data['ok'] ?? true) !== false && empty($data['unavailable']);

            $results[] = [
                'role' => $role,
                'phone' => $phone,
                'ok' => $ok,
                'pattern_code' => $patternCode !== '' ? $patternCode : null,
                'message' => $message,
                'error' => $ok ? null : (string) ($data['message'] ?? 'send_failed'),
            ];
        }

        $out = [
            'ok' => collect($results)->contains(fn ($r) => $r['ok']),
            'event_key' => $eventKey,
            'results' => $results,
        ];
        if (! $out['ok']) {
            $out['reason'] = 'send_failed';
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, string>
     */
    protected function smsVars(Tenant $tenant, ?Order $order, array $overrides, string $eventKey): array
    {
        $locale = app()->getLocale() === 'en' ? 'en' : 'fa';
        $vars = [
            'event' => $eventKey,
            'store_name' => (string) ($tenant->store_display_name ?: $tenant->name),
        ];
        if ($order) {
            $vars += [
                'order_id' => (string) $order->id,
                'order_number' => (string) ($order->number ?? $order->id),
                'status' => (string) $order->status,
                'status_label' => OrderShippingStatuses::label((string) $order->status, $locale),
                'tracking_code' => (string) ($order->trackingCode() ?? ''),
                'customer_name' => (string) ($order->customer_name ?? ''),
                'customer_phone' => (string) ($order->customer_phone ?? ''),
                'total' => (string) ($order->total_minor ?? ''),
                'currency' => (string) ($order->currency ?? ''),
            ];
        }
        foreach ($overrides as $k => $v) {
            if (is_string($k) && (is_scalar($v) || $v === null)) {
                $vars[$k] = (string) $v;
            }
        }
        if (! isset($vars['customer_phone']) && isset($vars['phone'])) {
            $vars['customer_phone'] = $vars['phone'];
        }
        $vars += ['order_number' => (string) ($vars['order_id'] ?? ''), 'status_label' => '', 'tracking_code' => ''];

        return $vars;
    }

    /** @param  array<string, string>  $vars */
    protected function renderSms(string $body, array $vars): string
    {
        $map = [];
        foreach ($vars as $k => $v) {
            $map['{'.$k.'}'] = $v;
        }

        return strtr($body, $map);
    }
}
