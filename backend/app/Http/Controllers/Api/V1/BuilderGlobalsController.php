<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\BuilderGlobal;
use App\Services\Builder\BuilderGlobalsNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BuilderGlobalsController extends Controller
{
    use ResolvesPublicTenant;

    public function show(Request $request): JsonResponse
    {
        $row = BuilderGlobal::query()->where('tenant_id', $request->user()->tenant_id)->first();
        $normalizer = app(BuilderGlobalsNormalizer::class);

        return response()->json(['data' => [
            'has_draft' => is_array($row?->draft),
            'has_published' => is_array($row?->published),
            'settings' => $normalizer->normalize(is_array($row?->draft) ? $row->draft : (is_array($row?->published) ? $row->published : [])),
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['settings' => 'required|array']);
        $settings = app(BuilderGlobalsNormalizer::class)->normalize($data['settings']);
        $json = json_encode($settings);
        abort_if($json === false || strlen($json) > 200000, 422, 'settings too large');
        $row = BuilderGlobal::query()->updateOrCreate(
            ['tenant_id' => $request->user()->tenant_id],
            ['draft' => $settings],
        );

        return response()->json(['data' => [
            'has_draft' => true,
            'has_published' => is_array($row->published),
            'settings' => $settings,
        ]]);
    }

    public function publish(Request $request): JsonResponse
    {
        $row = BuilderGlobal::query()->where('tenant_id', $request->user()->tenant_id)->firstOrFail();
        abort_if(! is_array($row->draft), 422, 'draft missing');
        $row->published = $row->draft;
        $row->save();

        return response()->json(['data' => [
            'has_draft' => true,
            'has_published' => true,
            'settings' => $row->published,
        ]]);
    }

    public function publicShow(Request $request): JsonResponse
    {
        $row = BuilderGlobal::query()->where('tenant_id', $this->publicTenantId($request))->first();
        abort_unless($row && is_array($row->published), 404);

        return response()->json(['data' => [
            'settings' => $row->published,
        ]]);
    }
}
