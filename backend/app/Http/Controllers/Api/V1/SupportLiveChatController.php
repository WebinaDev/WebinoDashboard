<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SupportChatSession;
use App\Services\Support\LiveChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupportLiveChatController extends Controller
{
    public function __construct(private readonly LiveChatService $chat) {}

    public function publicStart(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $data = $request->validate([
            'visitor_token' => ['nullable', 'string', 'max:64'],
            'name' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'department_id' => ['nullable', 'integer'],
            'body' => ['nullable', 'string', 'max:10000'],
        ]);
        $result = $this->chat->start(
            $tid,
            $data['visitor_token'] ?? null,
            [
                'guest_name' => $data['name'] ?? null,
                'guest_email' => $data['email'] ?? null,
                'guest_phone' => $data['phone'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'ua' => substr((string) $request->userAgent(), 0, 240),
            ],
            (string) ($data['body'] ?? ''),
            $request->user()?->id,
        );

        return response()->json(['data' => $result], 201);
    }

    public function publicMessage(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $data = $request->validate([
            'visitor_token' => ['required', 'string', 'max:64'],
            'body' => ['required', 'string', 'max:10000'],
        ]);
        $session = $this->chat->findByVisitor($tid, $data['visitor_token']);
        abort_if(! $session || $session->status === 'closed', 404);
        $msg = $this->chat->postMessage($session, 'visitor', $request->user()?->id, $data['body']);

        return response()->json(['data' => $this->chat->mapMessage($msg)], 201);
    }

    public function publicPoll(Request $request): JsonResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $token = (string) $request->query('visitor_token', '');
        $after = (int) $request->query('after_id', 0);
        abort_if($token === '', 422);
        $session = $this->chat->findByVisitor($tid, $token);
        abort_if(! $session, 404);

        return response()->json([
            'data' => [
                'session' => $this->chat->mapSession($session),
                'messages' => $this->chat->pollMessages($session, $after),
                'realtime' => $this->chat->realtimeConfig($tid),
            ],
        ]);
    }

    public function publicStream(Request $request): StreamedResponse
    {
        $tid = (int) $request->attributes->get('tenant_id');
        $token = (string) $request->query('visitor_token', '');
        abort_if($token === '', 422);
        $session = $this->chat->findByVisitor($tid, $token);
        abort_if(! $session, 404);
        $after = (int) $request->query('after_id', 0);

        return response()->stream(function () use ($session, &$after) {
            $loops = 0;
            while ($loops < 25) {
                $loops++;
                $messages = $this->chat->pollMessages($session->fresh(), $after);
                if ($messages !== []) {
                    foreach ($messages as $m) {
                        $after = max($after, (int) $m['id']);
                        echo 'event: message'."\n";
                        echo 'data: '.json_encode($m, JSON_UNESCAPED_UNICODE)."\n\n";
                    }
                    if (function_exists('ob_flush')) {
                        @ob_flush();
                    }
                    flush();
                }
                $session->refresh();
                if ($session->status === 'closed') {
                    echo 'event: session'."\n";
                    echo 'data: '.json_encode(['status' => 'closed'], JSON_UNESCAPED_UNICODE)."\n\n";
                    flush();
                    break;
                }
                usleep(800000);
            }
            echo 'event: ping'."\n";
            echo 'data: {}'."\n\n";
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function staffIndex(Request $request): JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $status = (string) $request->query('status', '');
        $q = SupportChatSession::query()->where('tenant_id', $tid)->with(['agent', 'department']);
        if ($status !== '' && $status !== 'all') {
            $q->where('status', $status);
        } else {
            $q->whereIn('status', ['waiting', 'active']);
        }
        $rows = $q->orderByDesc('last_message_at')->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'data' => [
                'items' => $rows->map(fn (SupportChatSession $s) => $this->chat->mapSession($s))->all(),
                'realtime' => $this->chat->realtimeConfig($tid),
            ],
        ]);
    }

    public function staffShow(Request $request, int $session): JsonResponse
    {
        $row = $this->findStaff($request, $session);
        abort_if(! $row, 404);
        $row->load(['agent', 'department', 'messages']);

        return response()->json([
            'data' => [
                'session' => $this->chat->mapSession($row),
                'realtime' => $this->chat->realtimeConfig((int) $row->tenant_id),
            ],
        ]);
    }

    public function staffAccept(Request $request, int $session): JsonResponse
    {
        $row = $this->findStaff($request, $session);
        abort_if(! $row, 404);
        $row = $this->chat->accept($row, (int) $request->user()->id);

        return response()->json(['data' => $this->chat->mapSession($row->fresh(['agent', 'department', 'messages']))]);
    }

    public function staffMessage(Request $request, int $session): JsonResponse
    {
        $row = $this->findStaff($request, $session);
        abort_if(! $row, 404);
        $data = $request->validate(['body' => ['required', 'string', 'max:10000']]);
        if (! $row->agent_id) {
            $this->chat->accept($row, (int) $request->user()->id);
            $row->refresh();
        }
        $msg = $this->chat->postMessage($row, 'agent', (int) $request->user()->id, $data['body']);

        return response()->json(['data' => $this->chat->mapMessage($msg)], 201);
    }

    public function staffClose(Request $request, int $session): JsonResponse
    {
        $row = $this->findStaff($request, $session);
        abort_if(! $row, 404);
        $data = $request->validate(['create_ticket' => ['sometimes', 'boolean']]);
        $row = $this->chat->close($row, (int) $request->user()->id, (bool) ($data['create_ticket'] ?? false));

        return response()->json(['data' => $this->chat->mapSession($row->fresh(['agent', 'department', 'messages']))]);
    }

    public function staffPoll(Request $request, int $session): JsonResponse
    {
        $row = $this->findStaff($request, $session);
        abort_if(! $row, 404);
        $after = (int) $request->query('after_id', 0);

        return response()->json([
            'data' => [
                'session' => $this->chat->mapSession($row->load(['agent', 'department'])),
                'messages' => $this->chat->pollMessages($row, $after),
            ],
        ]);
    }

    private function findStaff(Request $request, int $id): ?SupportChatSession
    {
        return SupportChatSession::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('id', $id)
            ->first();
    }
}
