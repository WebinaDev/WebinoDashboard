<?php

namespace App\Services\Support;

use App\Events\Support\ChatMessageCreated;
use App\Events\Support\ChatSessionUpdated;
use App\Models\SupportChatMessage;
use App\Models\SupportChatSession;
use App\Models\UserNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class LiveChatService
{
    public function start(
        int $tenantId,
        ?string $visitorToken,
        array $attrs,
        string $firstMessage,
        ?int $userId = null,
    ): array {
        $settings = OnlineSupportSettings::get($tenantId);
        abort_unless($settings['enabled'], 404);
        abort_unless((bool) data_get($settings, 'channels.live_chat.enabled', true), 422, 'Live chat disabled');

        $token = $visitorToken && strlen($visitorToken) >= 16 ? $visitorToken : Str::random(40);
        $session = SupportChatSession::query()
            ->where('tenant_id', $tenantId)
            ->where('visitor_token', $token)
            ->whereIn('status', ['waiting', 'active'])
            ->first();

        if (! $session) {
            $session = SupportChatSession::query()->create([
                'tenant_id' => $tenantId,
                'visitor_token' => $token,
                'user_id' => $userId,
                'department_id' => $attrs['department_id'] ?? data_get($settings, 'offline.default_department_id'),
                'status' => 'waiting',
                'guest_name' => $attrs['guest_name'] ?? null,
                'guest_email' => $attrs['guest_email'] ?? null,
                'guest_phone' => $attrs['guest_phone'] ?? null,
                'last_message_at' => now(),
                'meta' => ['ua' => $attrs['ua'] ?? null],
            ]);
            $this->systemMessage($session, __('api.chat_session_started'));
            $this->notifyAgents($session, 'new');
            $this->safeEvent(new ChatSessionUpdated($session));
        }

        $message = null;
        if (trim($firstMessage) !== '') {
            $message = $this->postMessage($session, 'visitor', $userId, $firstMessage);
        }

        return [
            'session' => $this->mapSession($session->fresh(['agent', 'department', 'messages'])),
            'visitor_token' => $token,
            'message' => $message ? $this->mapMessage($message) : null,
            'realtime' => $this->realtimeConfig($tenantId),
        ];
    }

    public function postMessage(
        SupportChatSession $session,
        string $senderType,
        ?int $senderId,
        string $body,
        array $attachments = [],
    ): SupportChatMessage {
        abort_if(in_array($session->status, ['closed'], true), 422, __('api.chat_closed'));
        $msg = SupportChatMessage::query()->create([
            'tenant_id' => $session->tenant_id,
            'session_id' => $session->id,
            'sender_type' => $senderType,
            'sender_id' => $senderId,
            'body' => mb_substr(trim($body) !== '' ? trim($body) : ' ', 0, 10000),
            'attachments' => $attachments === [] ? null : $attachments,
            'created_at' => Carbon::now(),
        ]);
        $session->last_message_at = now();
        if ($senderType === 'agent' && $session->status === 'waiting') {
            $session->status = 'active';
            $session->accepted_at = $session->accepted_at ?? now();
            if (! $session->agent_id && $senderId) {
                $session->agent_id = $senderId;
            }
        }
        $session->save();

        $this->safeEvent(new ChatMessageCreated($msg, $session));
        $this->safeEvent(new ChatSessionUpdated($session->fresh()));

        if ($senderType === 'visitor') {
            $this->notifyAgents($session, 'message');
        }

        return $msg;
    }

    public function accept(SupportChatSession $session, int $agentId): SupportChatSession
    {
        abort_if($session->status === 'closed', 422);
        $session->agent_id = $agentId;
        $session->status = 'active';
        $session->accepted_at = $session->accepted_at ?? now();
        $session->save();
        $this->systemMessage($session, __('api.chat_agent_joined'));
        $this->safeEvent(new ChatSessionUpdated($session));

        return $session;
    }

    public function close(SupportChatSession $session, ?int $actorId = null, bool $createTicket = false): SupportChatSession
    {
        if ($session->status === 'closed') {
            return $session;
        }
        $session->status = 'closed';
        $session->closed_at = now();
        $session->save();
        $this->systemMessage($session, __('api.chat_session_closed'));

        if ($createTicket && ! $session->ticket_id) {
            $body = $session->messages()
                ->orderBy('id')
                ->get()
                ->map(fn (SupportChatMessage $m) => '['.$m->sender_type.'] '.$m->body)
                ->implode("\n");
            $ticket = app(SupportTicketService::class)->createTicket(
                (int) $session->tenant_id,
                [
                    'user_id' => $session->user_id,
                    'guest_name' => $session->guest_name,
                    'guest_email' => $session->guest_email,
                    'guest_phone' => $session->guest_phone,
                    'department_id' => $session->department_id,
                    'assignee_id' => $session->agent_id,
                    'subject' => __('api.chat_ticket_subject', ['id' => $session->id]),
                    'source' => 'live_chat',
                ],
                $body !== '' ? $body : __('api.chat_session_closed'),
                $actorId,
                true,
            );
            $session->ticket_id = $ticket->id;
            $session->save();
        }

        $this->safeEvent(new ChatSessionUpdated($session));

        return $session;
    }

    /** @return list<array<string, mixed>> */
    public function pollMessages(SupportChatSession $session, int $afterId = 0): array
    {
        return SupportChatMessage::query()
            ->where('session_id', $session->id)
            ->where('id', '>', $afterId)
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->map(fn (SupportChatMessage $m) => $this->mapMessage($m))
            ->all();
    }

    public function findByVisitor(int $tenantId, string $token): ?SupportChatSession
    {
        return SupportChatSession::query()
            ->where('tenant_id', $tenantId)
            ->where('visitor_token', $token)
            ->with(['agent', 'department', 'messages'])
            ->first();
    }

    /** @return array<string, mixed> */
    public function mapSession(SupportChatSession $s): array
    {
        return [
            'id' => $s->id,
            'status' => $s->status,
            'guest_name' => $s->guest_name,
            'guest_email' => $s->guest_email,
            'department_id' => $s->department_id,
            'department_name' => $s->department?->name_fa ?? $s->department?->name_en,
            'agent_id' => $s->agent_id,
            'agent_name' => $s->agent?->name,
            'ticket_id' => $s->ticket_id,
            'last_message_at' => optional($s->last_message_at)?->toIso8601String(),
            'accepted_at' => optional($s->accepted_at)?->toIso8601String(),
            'closed_at' => optional($s->closed_at)?->toIso8601String(),
            'created_at' => optional($s->created_at)?->toIso8601String(),
            'messages' => $s->relationLoaded('messages')
                ? $s->messages->map(fn (SupportChatMessage $m) => $this->mapMessage($m))->all()
                : [],
        ];
    }

    /** @return array<string, mixed> */
    public function mapMessage(SupportChatMessage $m): array
    {
        return [
            'id' => $m->id,
            'session_id' => $m->session_id,
            'sender_type' => $m->sender_type,
            'sender_id' => $m->sender_id,
            'body' => $m->body,
            'attachments' => $m->attachments ?? [],
            'created_at' => optional($m->created_at)?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function realtimeConfig(int $tenantId): array
    {
        $driver = (string) config('broadcasting.default', 'null');
        $pusher = config('broadcasting.connections.pusher', []);
        $reverb = config('broadcasting.connections.reverb', []);

        return [
            'driver' => $driver,
            'enabled' => in_array($driver, ['pusher', 'reverb', 'ably'], true),
            'channel' => 'support.tenant.'.$tenantId,
            'key' => $driver === 'reverb'
                ? ($reverb['key'] ?? null)
                : ($pusher['key'] ?? null),
            'ws_host' => $driver === 'reverb'
                ? ($reverb['options']['host'] ?? null)
                : ($pusher['options']['host'] ?? null),
            'ws_port' => $driver === 'reverb'
                ? ($reverb['options']['port'] ?? null)
                : ($pusher['options']['port'] ?? null),
            'force_tls' => (bool) (
                $driver === 'reverb'
                    ? ($reverb['options']['useTLS'] ?? false)
                    : ($pusher['options']['useTLS'] ?? true)
            ),
            'poll_ms' => 2000,
        ];
    }

    private function safeEvent(object $event): void
    {
        try {
            event($event);
        } catch (\Throwable) {
            // Broadcast driver (Reverb/Pusher) may be unconfigured; polling/SSE still work.
        }
    }

    private function systemMessage(SupportChatSession $session, string $body): void
    {
        SupportChatMessage::query()->create([
            'tenant_id' => $session->tenant_id,
            'session_id' => $session->id,
            'sender_type' => 'system',
            'sender_id' => null,
            'body' => $body,
            'created_at' => Carbon::now(),
        ]);
    }

    private function notifyAgents(SupportChatSession $session, string $kind): void
    {
        $agents = \App\Models\User::query()
            ->where('tenant_id', $session->tenant_id)
            ->whereIn('role', ['admin', 'staff'])
            ->where('is_active', true)
            ->limit(20)
            ->pluck('id');
        $title = $kind === 'new' ? __('api.chat_new_session') : __('api.chat_new_message');
        foreach ($agents as $uid) {
            UserNotification::query()->create([
                'tenant_id' => $session->tenant_id,
                'user_id' => (int) $uid,
                'type' => 'ticket',
                'title' => $title,
                'body' => $session->guest_name ?: ('#'.$session->id),
                'link' => '/dashboard/support?tab=live',
                'created_at' => now(),
            ]);
        }
    }
}
