<?php

namespace App\Services\Wallet;

use App\Models\User;
use App\Models\WalletLedger;
use App\Models\WalletSetting;
use App\Models\WalletWithdrawal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WalletService
{
    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            'enabled' => true,
            'title' => 'کیف پول',
            'min_topup_minor' => 10000,
            'min_withdraw_minor' => 50000,
        ];
    }

    /** @return array<string, mixed> */
    public function settings(int $tenantId): array
    {
        $row = WalletSetting::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            ['payload' => self::defaultSettings()]
        );

        return $row->payload ?? self::defaultSettings();
    }

    /** @param  array<string, mixed>  $payload */
    public function updateSettings(int $tenantId, array $payload): array
    {
        $row = WalletSetting::query()->updateOrCreate(
            ['tenant_id' => $tenantId],
            ['payload' => $payload]
        );

        return $row->payload ?? [];
    }

    public function adjust(User $user, int $tenantId, string $direction, int $amountMinor, string $reason, ?string $note = null, ?string $refType = null, ?int $refId = null): WalletLedger
    {
        if ($amountMinor < 1) {
            throw ValidationException::withMessages(['amount_minor' => 'Amount must be positive']);
        }
        if (! in_array($direction, ['credit', 'debit'], true)) {
            throw ValidationException::withMessages(['direction' => 'Invalid direction']);
        }

        return DB::transaction(function () use ($user, $tenantId, $direction, $amountMinor, $reason, $note, $refType, $refId) {
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $balance = (int) ($locked->wallet_balance_minor ?? 0);
            if ($direction === 'debit' && $balance < $amountMinor) {
                throw ValidationException::withMessages(['amount_minor' => 'Insufficient balance']);
            }
            $next = $direction === 'credit' ? $balance + $amountMinor : $balance - $amountMinor;
            $locked->update(['wallet_balance_minor' => $next]);

            return WalletLedger::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $locked->id,
                'direction' => $direction,
                'amount_minor' => $amountMinor,
                'balance_after_minor' => $next,
                'reason' => $reason,
                'ref_type' => $refType,
                'ref_id' => $refId,
                'note' => $note,
            ]);
        });
    }

    public function requestWithdraw(User $user, int $tenantId, int $amountMinor, ?string $sheba = null): WalletWithdrawal
    {
        $settings = $this->settings($tenantId);
        $min = (int) ($settings['min_withdraw_minor'] ?? 0);
        if ($amountMinor < max(1, $min)) {
            throw ValidationException::withMessages(['amount_minor' => 'Below minimum withdraw']);
        }

        return DB::transaction(function () use ($user, $tenantId, $amountMinor, $sheba) {
            $this->adjust($user, $tenantId, 'debit', $amountMinor, 'withdraw_request', null, 'withdrawal', null);
            $wd = WalletWithdrawal::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $user->id,
                'amount_minor' => $amountMinor,
                'sheba' => $sheba ?? $user->bank_sheba,
                'status' => 'pending',
            ]);
            WalletLedger::query()
                ->where('tenant_id', $tenantId)
                ->where('user_id', $user->id)
                ->where('reason', 'withdraw_request')
                ->whereNull('ref_id')
                ->latest('id')
                ->first()
                ?->update(['ref_id' => $wd->id, 'ref_type' => 'withdrawal']);

            return $wd;
        });
    }

    public function updateWithdrawal(WalletWithdrawal $wd, string $status, ?string $adminNote = null): WalletWithdrawal
    {
        if (! in_array($status, ['approved', 'rejected', 'paid'], true)) {
            throw ValidationException::withMessages(['status' => 'Invalid status']);
        }

        return DB::transaction(function () use ($wd, $status, $adminNote) {
            if ($wd->status === 'rejected' || $wd->status === 'paid') {
                throw ValidationException::withMessages(['status' => 'Withdrawal already finalized']);
            }
            if ($status === 'rejected' && $wd->status === 'pending') {
                $user = User::query()->findOrFail($wd->user_id);
                $this->adjust($user, $wd->tenant_id, 'credit', (int) $wd->amount_minor, 'withdraw_rejected', $adminNote, 'withdrawal', $wd->id);
            }
            $wd->update([
                'status' => $status,
                'admin_note' => $adminNote ?? $wd->admin_note,
            ]);

            return $wd->fresh()->load('user:id,name,email,bank_sheba,wallet_balance_minor');
        });
    }
}
