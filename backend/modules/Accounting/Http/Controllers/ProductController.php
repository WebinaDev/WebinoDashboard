<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Accounting\Entities\AccProduct;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = AccProduct::query()->orderBy('name');
        if ($request->filled('q')) {
            $s = '%'.$request->string('q').'%';
            $q->where(function ($q) use ($s) {
                $q->where('name', 'like', $s)->orWhere('barcode', 'like', $s);
            });
        }

        return response()->json(['data' => $q->paginate(min((int) $request->input('per_page', 25), 100))]);
    }
}
