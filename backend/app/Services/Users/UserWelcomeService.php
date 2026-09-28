<?php

namespace App\Services\Users;

use App\Models\User;
use App\Services\Notifications\NotificationDispatcher;
use App\Services\Shop\LoyaltyService;
use Illuminate\Support\Facades\Log;

final class UserWelcomeService
{
    public function __construct(
        private readonly NotificationDispatcher $dispatcher,
        private readonly LoyaltyService $loyalty,
    ) {}

    public function welcome(User $user, ?User $referrer = null): void
    {
        try {
            $this->loyalty->awardWelcome($user);
            if ($referrer) {
                $this->loyalty->awardReferral($referrer, $user);
            }
            $this->dispatcher->dispatch('user_welcome', (int) $user->tenant_id, [
                'vars' => ['customer_name' => (string) ($user->name ?? '')],
                'customer_user_id' => (int) $user->id,
                'customer_email' => (string) ($user->email ?? ''),
                'customer_phone' => (string) ($user->phone ?? ''),
                'customer_link' => '/dashboard/account',
                'admin_link' => '/dashboard/users/'.$user->id,
            ]);
        } catch (\Throwable $e) {
            Log::warning('user_welcome_failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }
    }
}
