<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\ResolvesPublicTenant;
use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollVote;
use Illuminate\Http\Request;

class PollController extends Controller
{
    use ResolvesPublicTenant;

    public function publicShow(Request $request, int $poll): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $row = Poll::query()->where('tenant_id', $tid)->where('id', $poll)->where('is_active', true)->firstOrFail();

        return response()->json(['data' => $this->mapPoll($row, includeResults: true)]);
    }

    public function publicVote(Request $request, int $poll): \Illuminate\Http\JsonResponse
    {
        $tid = $this->publicTenantId($request);
        $row = Poll::query()->where('tenant_id', $tid)->where('id', $poll)->where('is_active', true)->firstOrFail();
        if ($row->closes_at && $row->closes_at->isPast()) {
            return response()->json(['message' => 'poll_closed'], 422);
        }
        $data = $request->validate(['option_index' => ['required', 'integer', 'min:0', 'max:20']]);
        $options = is_array($row->options) ? $row->options : [];
        abort_if($data['option_index'] >= count($options), 422);

        $user = $request->user('sanctum');
        $guest = trim((string) $request->header('X-Guest-Token', ''));
        if ($user) {
            PollVote::query()->updateOrCreate(
                ['poll_id' => $row->id, 'user_id' => $user->id],
                ['option_index' => (int) $data['option_index'], 'guest_token' => null, 'created_at' => now()]
            );
        } elseif ($guest !== '') {
            PollVote::query()->updateOrCreate(
                ['poll_id' => $row->id, 'guest_token' => $guest],
                ['option_index' => (int) $data['option_index'], 'user_id' => null, 'created_at' => now()]
            );
        } else {
            return response()->json(['message' => 'login_or_guest_required'], 401);
        }

        return response()->json(['data' => $this->mapPoll($row->fresh(), includeResults: true)]);
    }

    public function adminIndex(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $items = Poll::query()->where('tenant_id', $tid)->orderByDesc('id')->get()
            ->map(fn (Poll $p) => $this->mapPoll($p, includeResults: true));

        return response()->json(['data' => ['items' => $items]]);
    }

    public function adminStore(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $data = $request->validate([
            'title' => ['required', 'string', 'max:190'],
            'options' => ['required', 'array', 'min:2', 'max:12'],
            'options.*' => ['required', 'string', 'max:120'],
            'is_active' => ['nullable', 'boolean'],
            'closes_at' => ['nullable', 'date'],
        ]);
        $row = Poll::query()->create(array_merge($data, ['tenant_id' => $tid]));

        return response()->json(['data' => $this->mapPoll($row, includeResults: false)], 201);
    }

    public function adminUpdate(Request $request, Poll $poll): \Illuminate\Http\JsonResponse
    {
        abort_if((int) $poll->tenant_id !== (int) $request->user()->tenant_id, 404);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:190'],
            'options' => ['sometimes', 'array', 'min:2', 'max:12'],
            'options.*' => ['required', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
            'closes_at' => ['nullable', 'date'],
        ]);
        $poll->update($data);

        return response()->json(['data' => $this->mapPoll($poll->fresh(), includeResults: true)]);
    }

    /** @return array<string, mixed> */
    protected function mapPoll(Poll $poll, bool $includeResults): array
    {
        $options = is_array($poll->options) ? array_values($poll->options) : [];
        $counts = array_fill(0, count($options), 0);
        if ($includeResults) {
            $votes = PollVote::query()->where('poll_id', $poll->id)->get(['option_index']);
            foreach ($votes as $vote) {
                $i = (int) $vote->option_index;
                if (isset($counts[$i])) {
                    $counts[$i]++;
                }
            }
        }

        return [
            'id' => $poll->id,
            'title' => $poll->title,
            'options' => $options,
            'is_active' => (bool) $poll->is_active,
            'closes_at' => $poll->closes_at?->toIso8601String(),
            'counts' => $includeResults ? $counts : null,
            'total_votes' => $includeResults ? array_sum($counts) : null,
        ];
    }
}
