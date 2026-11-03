<?php

namespace App\Events\Support;

use App\Models\SupportChatSession;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ChatSessionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public SupportChatSession $session) {}

    /** @return array<int, Channel> */
    public function broadcastOn(): array
    {
        return [
            new Channel('support.tenant.'.$this->session->tenant_id),
            new Channel('support.chat.'.$this->session->id),
            new Channel('support.chat.visitor.'.$this->session->visitor_token),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chat.session';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'session' => [
                'id' => $this->session->id,
                'status' => $this->session->status,
                'agent_id' => $this->session->agent_id,
                'ticket_id' => $this->session->ticket_id,
                'last_message_at' => optional($this->session->last_message_at)?->toIso8601String(),
            ],
        ];
    }
}
