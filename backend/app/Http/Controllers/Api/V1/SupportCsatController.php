<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportCsatCampaign;
use App\Services\Support\CsatCampaignService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportCsatController extends Controller
{
    public function campaigns(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $rows = SupportCsatCampaign::query()->where('tenant_id', $tid)->orderByDesc('is_default')->orderBy('id')->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportCsatCampaign $c) => $this->map($c))->all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $this->validated($request);
        if (! empty($data['is_default'])) {
            SupportCsatCampaign::query()->where('tenant_id', $tid)->update(['is_default' => false]);
        }
        $row = SupportCsatCampaign::query()->create(['tenant_id' => $tid, ...$data]);

        return response()->json(['data' => $this->map($row)], 201);
    }

    public function update(Request $request, int $campaign): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $row = SupportCsatCampaign::query()->where('tenant_id', $tid)->where('id', $campaign)->firstOrFail();
        $data = $this->validated($request, partial: true);
        if (! empty($data['is_default'])) {
            SupportCsatCampaign::query()->where('tenant_id', $tid)->where('id', '!=', $row->id)->update(['is_default' => false]);
        }
        $row->fill($data)->save();

        return response()->json(['data' => $this->map($row)]);
    }

    public function destroy(Request $request, int $campaign): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        SupportCsatCampaign::query()->where('tenant_id', $tid)->where('id', $campaign)->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function report(Request $request, CsatCampaignService $csat): JsonResponse
    {
        $days = (int) $request->query('days', 30);

        return response()->json(['data' => $csat->report((int) $request->user()->tenant_id, $days)]);
    }

    public function publicShow(Request $request, string $token, CsatCampaignService $csat): JsonResponse
    {
        $data = $csat->publicSurvey($token);
        abort_if(! $data, 404);

        return response()->json(['data' => $data]);
    }

    public function publicSubmit(Request $request, string $token, CsatCampaignService $csat): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);
        $ticket = $csat->submit($token, (int) $data['rating'], $data['comment'] ?? null);
        abort_if(! $ticket, 404);

        return response()->json(['data' => ['ok' => true, 'rating' => $ticket->csat_rating]]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'name_fa' => [$req, 'string', 'max:160'],
            'name_en' => ['nullable', 'string', 'max:160'],
            'question_fa' => [$req, 'string', 'max:500'],
            'question_en' => ['nullable', 'string', 'max:500'],
            'thank_you_fa' => ['nullable', 'string', 'max:500'],
            'thank_you_en' => ['nullable', 'string', 'max:500'],
            'delay_minutes' => ['sometimes', 'integer', 'min:0', 'max:10080'],
            'channels' => ['nullable', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        foreach (['is_active', 'is_default'] as $b) {
            if (isset($data[$b])) {
                $data[$b] = (bool) $data[$b];
            }
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function map(SupportCsatCampaign $c): array
    {
        return [
            'id' => $c->id,
            'name_fa' => $c->name_fa,
            'name_en' => $c->name_en,
            'question_fa' => $c->question_fa,
            'question_en' => $c->question_en,
            'thank_you_fa' => $c->thank_you_fa,
            'thank_you_en' => $c->thank_you_en,
            'delay_minutes' => (int) $c->delay_minutes,
            'channels' => $c->channels ?? ['notification' => true],
            'is_active' => (bool) $c->is_active,
            'is_default' => (bool) $c->is_default,
        ];
    }
}
