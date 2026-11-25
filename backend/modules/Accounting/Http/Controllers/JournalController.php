<?php

namespace Modules\Accounting\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Modules\Accounting\Entities\AccJournalEntry;

class JournalController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => AccJournalEntry::query()->orderByDesc('document_date')->limit(50)->get()]);
    }
}
