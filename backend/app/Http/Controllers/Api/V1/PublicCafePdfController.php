<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Services\Cafe\CafeMenuPdf;
use Illuminate\Http\Request;

/**
 * The menu as a document a guest can keep: a PDF when a renderer is installed, otherwise
 * clean print HTML. `lang=en` and `prices=0` give the English, price-free variant a venue
 * can hang at the counter.
 */
class PublicCafePdfController extends Controller
{
    use ResolvesPublicTenant;

    public function menu(Request $request, CafeMenuPdf $pdf): \Symfony\Component\HttpFoundation\Response
    {
        $locale = $request->query('lang') === 'en' ? 'en' : 'fa';
        $menuId = (int) $request->query('menu_id', 0);
        $withPrices = $request->query('prices') !== '0';
        $inline = $request->boolean('inline');

        $rendered = $pdf->render($this->publicTenant($request), $menuId > 0 ? $menuId : null, $locale, $withPrices);

        if (class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
            $document = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($rendered['html']);

            return $inline
                ? $document->setPaper('a4')->stream($rendered['filename'])
                : $document->setPaper('a4')->download($rendered['filename']);
        }

        return response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'.$rendered['filename'].'</title>'
            .'<style>@media print{@page{margin:16mm}}body{max-width:820px;margin:24px auto;padding:0 16px}</style>'
            .'</head><body><button onclick="window.print()" style="margin-bottom:18px;padding:8px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Print</button>'
            .'<div>'.$this->extractBody($rendered['html']).'</div></body></html>',
            200,
            ['Content-Type' => 'text/html; charset=UTF-8', 'Cache-Control' => 'no-store'],
        );
    }

    /** Only the <body> of the print view: the wrapper above already declares the document. */
    private function extractBody(string $html): string
    {
        if (preg_match('/<body[^>]*>(.*)<\/body>/is', $html, $m) === 1) {
            return $m[1];
        }

        return $html;
    }
}
