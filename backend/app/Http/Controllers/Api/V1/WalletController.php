<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WalletLedger;
use App\Models\WalletWithdrawal;
use App\Services\Wallet\WalletService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WalletController extends Controller
{
    public function __construct(protected WalletService $wallet) {}

    public function settings(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['data' => $this->wallet->settings($request->user()->tenant_id)]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['payload' => ['required', 'array']]);

        return response()->json(['data' => $this->wallet->updateSettings($request->user()->tenant_id, $data['payload'])]);
    }

    public function userWallet(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $u = User::query()->where('tenant_id', $tid)->whereKey($user)->firstOrFail();
        $ledger = WalletLedger::query()
            ->where('tenant_id', $tid)
            ->where('user_id', $u->id)
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => [
                'user' => $u->only(['id', 'name', 'email', 'wallet_balance_minor', 'bank_sheba']),
                'ledger' => $ledger,
            ],
        ]);
    }

    public function adjust(Request $request, int $user): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $u = User::query()->where('tenant_id', $tid)->whereKey($user)->firstOrFail();
        $data = $request->validate([
            'direction' => ['required', 'string', 'in:credit,debit'],
            'amount_minor' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);
        $entry = $this->wallet->adjust($u, $tid, $data['direction'], (int) $data['amount_minor'], 'admin_adjust', $data['note'] ?? null);

        return response()->json(['data' => $entry], 201);
    }

    public function topup(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tid)],
            'amount_minor' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);
        $settings = $this->wallet->settings($tid);
        $min = (int) ($settings['min_topup_minor'] ?? 0);
        if ($data['amount_minor'] < max(1, $min)) {
            return response()->json(['message' => 'Below minimum topup'], 422);
        }
        $u = User::query()->findOrFail($data['user_id']);
        // Staff topup credits immediately (portal payment flow comes later)
        $entry = $this->wallet->adjust($u, $tid, 'credit', (int) $data['amount_minor'], 'topup', $data['note'] ?? 'admin topup', 'admin', $request->user()->id);

        return response()->json(['data' => $entry], 201);
    }

    public function withdrawals(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $q = WalletWithdrawal::query()->where('tenant_id', $tid)->with('user:id,name,email,bank_sheba,wallet_balance_minor');
        if ($request->filled('status') && $request->query('status') !== 'all') {
            $q->where('status', $request->query('status'));
        }
        $items = $q->orderByDesc('id')->paginate(min(50, max(1, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $items->items(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page' => $items->lastPage(),
                'total' => $items->total(),
            ],
        ]);
    }

    public function updateWithdrawal(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'integer'],
            'status' => ['required', 'string', 'in:approved,rejected,paid'],
            'admin_note' => ['nullable', 'string'],
        ]);
        $wd = WalletWithdrawal::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->whereKey($data['id'])
            ->firstOrFail();

        return response()->json([
            'data' => $this->wallet->updateWithdrawal($wd, $data['status'], $data['admin_note'] ?? null),
        ]);
    }

    public function createWithdrawal(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = $request->user()->tenant_id;
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tid)],
            'amount_minor' => ['required', 'integer', 'min:1'],
            'sheba' => ['nullable', 'string', 'max:34'],
        ]);
        $u = User::query()->findOrFail($data['user_id']);
        $wd = $this->wallet->requestWithdraw($u, $tid, (int) $data['amount_minor'], $data['sheba'] ?? null);

        return response()->json(['data' => $wd->load('user:id,name,email')], 201);
    }
}
