<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Cafe\Services\MenuImport;

/**
 * Importing a price list the shop already has.
 *
 * Preview first, commit second, and the file is sent as text rather than multipart: the
 * dashboard reads the CSV in the browser and posts its contents, which keeps the endpoint the
 * same whether the sheet came from Excel, a Google Sheet, or a copy-paste.
 */
class CafeMenuImportController extends Controller
{
    public function __construct(private readonly MenuImport $import) {}

    /** Parse and report. Writes nothing. */
    public function preview(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        return response()->json([
            'data' => $this->import->preview(
                (string) $data['content'],
                (array) ($data['map'] ?? []),
                (int) $request->user()->tenant_id,
            ),
        ]);
    }

    /** Apply the rows that parsed, and report the ones that did not. */
    public function commit(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        return response()->json([
            'data' => $this->import->commit(
                (string) $data['content'],
                (array) ($data['map'] ?? []),
                (int) $request->user()->tenant_id,
            ),
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            // 2 MB of text is far more than any café's price list and far less than a mistake.
            'content' => ['required', 'string', 'max:2000000'],
            'map' => ['nullable', 'array'],
            'map.*' => ['nullable', 'string', 'max:120'],
        ]);
    }
}
