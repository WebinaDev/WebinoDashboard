<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WordpressImportJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WordpressImportController extends Controller
{
    /** @var list<string> */
    private const RESOURCES = [
        'woo_products',
        'pages',
        'posts',
        'media',
        'menus',
    ];

    public function probe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_url' => 'required|url|max:500',
        ]);

        return response()->json([
            'data' => [
                'status' => 'scaffold',
                'source_url' => $data['source_url'],
                'resources' => self::RESOURCES,
                'note' => 'Remote fetch is intentionally disabled. A future plugin will push these resources.',
            ],
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_url' => 'required|url|max:500',
        ]);
        $job = WordpressImportJob::query()->create([
            'tenant_id' => $request->user()->tenant_id,
            'status' => 'scaffold',
            'source_url' => $data['source_url'],
            'summary' => [
                'resources' => self::RESOURCES,
                'note' => 'Scaffold only. No content was copied.',
            ],
        ]);

        return response()->json(['data' => $this->serialize($job)], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $jobs = WordpressImportJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->latest()
            ->limit(20)
            ->get();

        return response()->json([
            'data' => $jobs->map(fn (WordpressImportJob $job) => $this->serialize($job))->values(),
        ]);
    }

    public function show(Request $request, int $job): JsonResponse
    {
        $row = WordpressImportJob::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($job);

        return response()->json(['data' => $this->serialize($row)]);
    }

    /** @return array<string, mixed> */
    private function serialize(WordpressImportJob $job): array
    {
        return [
            'id' => $job->id,
            'status' => $job->status,
            'source_url' => $job->source_url,
            'summary' => $job->summary,
            'created_at' => optional($job->created_at)?->toIso8601String(),
        ];
    }
}
