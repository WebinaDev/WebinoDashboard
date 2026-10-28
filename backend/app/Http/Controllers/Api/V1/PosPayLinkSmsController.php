<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Tenant;
use App\Services\Auth\OtpSettings;
use App\Services\Marketplace\Basalam\BasalamAuth;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Sms\ModirPayamakClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** POS pay-link → SMS to the buyer (WP parity: class-webino-dashboard-sms-pos-payment.php). */
class PosPayLinkSmsController extends Controller
{
    public const DEFAULT_TEMPLATE = "{name} عزیز، سفارش #{order} در {store} به مبلغ {total} ثبت شد.\nپرداخت: {link}";

    public function send(Request $request, int $order, ModirPayamakClient $sms): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = Order::query()->where('tenant_id', $tid)->findOrFail($order);
        abort_unless($row->is_pay_link && $row->payment_url, 422, 'این سفارش لینک پرداخت ندارد.');
        $data = $request->validate([
            'phone' => ['nullable', 'string', 'max:20'],
            'message' => ['nullable', 'string', 'max:500'],
        ]);
        $phone = trim((string) ($data['phone'] ?? $row->customer_phone ?? ''));
        abort_if($phone === '', 422, 'شماره موبایل مشتری مشخص نیست.');

        $tenant = Tenant::query()->findOrFail($tid);
        $link = str_starts_with((string) $row->payment_url, 'http')
            ? (string) $row->payment_url
            : rtrim(BasalamAuth::siteUrl($tid), '/').$row->payment_url;
        $text = strtr((string) ($data['message'] ?? '') ?: self::DEFAULT_TEMPLATE, [
            '{name}' => (string) ($row->customer_name ?: 'مشتری'),
            '{order}' => (string) ($row->number ?? $row->id),
            '{store}' => (string) ($tenant->store_display_name ?: $tenant->name ?: ''),
            '{total}' => number_format((int) $row->total_minor).' '.($row->currency === 'IRT' ? 'تومان' : 'ریال'),
            '{link}' => $link,
        ]);
        $body = ['message' => $text, 'recipients' => [$phone]];
        $from = (string) (OtpSettings::forTenant($tid, app(ModuleSettingsService::class))['sender_line_service'] ?? '');
        if ($from !== '') {
            $body['from_number'] = $from;
        }
        $res = $sms->post($tenant, 'send', $body);
        $ok = ! empty($res['ok']) && empty($res['data']['unavailable']);
        $meta = is_array($row->meta) ? $row->meta : [];
        $meta['pay_link_sms'][] = ['to' => $phone, 'ok' => $ok, 'at' => now()->toIso8601String()];
        $row->update(['meta' => $meta]);

        return response()->json(['ok' => $ok, 'link' => $link], $ok ? 200 : 502);
    }
}
