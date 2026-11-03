<?php

namespace App\Events\Support;

use App\Models\SupportChatMessage;
use App\Models\SupportChatSession;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ChatMessageCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public SupportChatMessage $message,
        public SupportChatSession $session,
    ) {}

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
        return 'chat.message';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->session->id,
            'message' => [
                'id' => $this->message->id,
                'session_id' => $this->message->session_id,
                'sender_type' => $this->message->sender_type,
                'sender_id' => $this->message->sender_id,
                'body' => $this->message->body,
                'attachments' => $this->message->attachments ?? [],
                'created_at' => optional($this->message->created_at)?->toIso8601String(),
            ],
        ];
    }
}
