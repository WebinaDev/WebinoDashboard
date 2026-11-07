<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentIntent;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Serves an auto-submit HTML form for PSPs that require POST to the bank page.
 */
class PaymentFormBridgeController extends Controller
{
    public function show(Request $request, int $intent): Response
    {
        $row = PaymentIntent::query()->find($intent);
        if (! $row) {
            return response('Intent not found', 404);
        }
        $nonce = (string) $request->query('nonce', '');
        $expected = (string) data_get($row->meta, 'state', '');
        if ($expected !== '' && ($nonce === '' || ! hash_equals($expected, $nonce))) {
            return response('Invalid bridge nonce', 403);
        }
        $action = (string) data_get($row->meta, 'form_action', '');
        $fields = data_get($row->meta, 'form_fields', []);
        if ($action === '' || ! is_array($fields) || $fields === []) {
            return response('Bridge form incomplete', 422);
        }
        $method = strtoupper((string) data_get($row->meta, 'form_method', 'POST'));
        if (! in_array($method, ['POST', 'GET'], true)) {
            $method = 'POST';
        }
        $inputs = '';
        foreach ($fields as $k => $v) {
            $inputs .= '<input type="hidden" name="'.e((string) $k).'" value="'.e((string) $v).'">';
        }

        $html = '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>در حال انتقال به درگاه…</title></head>'
            .'<body><p>در حال انتقال به درگاه پرداخت…</p>'
            .'<form id="gw" method="'.$method.'" action="'.e($action).'">'.$inputs.'</form>'
            .'<script>document.getElementById("gw").submit();</script></body></html>';

        return response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }
}
