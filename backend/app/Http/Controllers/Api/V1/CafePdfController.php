<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Product;
use Illuminate\Http\Request;

class CafePdfController extends Controller
{
    public function menuPdf(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $tid = $request->user()->tenant_id;
        $menuId = $request->query('menu_id');

        $menu = null;
        if ($menuId) {
            $menu = Menu::query()->where('tenant_id', $tid)->where('id', $menuId)->first();
        }

        $categories = Category::query()
            ->where('tenant_id', $tid)
            ->orderBy('sort_order')
            ->get();

        $productsQuery = Product::query()
            ->where('tenant_id', $tid)
            ->where('is_hidden', false)
            ->with('category')
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($menu) {
            $productsQuery->where(fn ($q) => $q->where('menu_id', $menu->id)->orWhereNull('menu_id'));
        }

        $products = $productsQuery->get();

        $html = view('pdf.cafe-menu', [
            'menu' => $menu,
            'categories' => $categories,
            'products' => $products,
            'tenant' => $request->user()->tenant,
        ])->render();

        if (class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);

            return $pdf->download('menu.pdf');
        }

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Content-Disposition' => 'inline; filename="menu.html"',
        ]);
    }
}
