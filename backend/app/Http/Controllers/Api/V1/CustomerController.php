<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CustomerNote;
use App\Models\Order;
use App\Models\SupportTicket;
use App\Models\User;
use App\Services\Users\UserAdminService;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function __construct(protected UserAdminService $users) {}

    public function index(Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json($this->users->index($request, ['customer']));
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'name' => 'required_without_all:first_name,last_name|string|max:120',
            'email' => 'required|email|max:255',
        ]);

        $user = $this->users->store($request, 'customer');

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, int $customer): \Illuminate\Http\JsonResponse
    {
        $kyc = $request->validate([
            'kyc_status' => 'sometimes|nullable|string|in:none,pending,verified,rejected',
        ]);
        $user = $this->users->update($request, $customer, ['customer']);
        if (array_key_exists('kyc_status', $kyc)) {
            // Staff-only: the portal deliberately cannot change KYC (see AccountPortalController::profileUpdate).
            $user->forceFill([
                'kyc_status' => $kyc['kyc_status'],
                'kyc_verified_at' => $kyc['kyc_status'] === 'verified' ? ($user->kyc_verified_at ?? now()) : null,
            ])->save();
            $user = $user->fresh();
        }

        return response()->json(['data' => $user]);
    }

    /** Customer profile overview for staff: identity, KYC, bank, KPIs and recent activity. */
    public function profile(Request $request, int $customer): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $user = User::query()->where('tenant_id', $tid)->where('role', 'customer')->findOrFail($customer);

        $orders = Order::query()->where('tenant_id', $tid)->where('user_id', $user->id);
        $paidStatuses = ['paid', 'processing', 'shipped', 'completed'];
        $paid = (clone $orders)->whereIn('status', $paidStatuses);
        $paidCount = (clone $paid)->count();
        $spent = (int) (clone $paid)->sum('total_minor');
        $tickets = SupportTicket::query()->where('tenant_id', $tid)->where('user_id', $user->id);

        return response()->json(['data' => [
            'customer' => $user->only([
                'id', 'name', 'first_name', 'last_name', 'email', 'phone', 'landline', 'national_id', 'birth_date', 'job',
                'kyc_status', 'kyc_verified_at', 'bank_name', 'bank_sheba', 'bank_account', 'bank_card',
                'is_active', 'wallet_balance_minor', 'loyalty_points', 'addresses', 'created_at',
            ]),
            'stats' => [
                'orders_count' => (clone $orders)->count(),
                'paid_orders_count' => $paidCount,
                'total_spent_minor' => $spent,
                'avg_order_minor' => $paidCount > 0 ? intdiv($spent, $paidCount) : 0,
                'last_order_at' => optional((clone $orders)->max('created_at'), fn ($v) => (string) $v),
                'open_tickets' => (clone $tickets)->whereNotIn('status', ['closed', 'resolved'])->count(),
                'tickets_count' => (clone $tickets)->count(),
                'notes_count' => CustomerNote::query()->where('tenant_id', $tid)->where('customer_user_id', $user->id)->count(),
                'wallet_balance_minor' => (int) ($user->wallet_balance_minor ?? 0),
                'loyalty_points' => (int) ($user->loyalty_points ?? 0),
            ],
            'recent_orders' => (clone $orders)->latest('id')->limit(5)
                ->get(['id', 'number', 'status', 'total_minor', 'currency', 'created_at']),
            'recent_tickets' => (clone $tickets)->latest('id')->limit(5)
                ->get(['id', 'subject', 'status', 'created_at']),
            'erp' => $this->erpLink($request, $tid),
        ]]);
    }

    /** Reverse link to the ERP Customer 360 Hub of the site owner (site admins only). */
    private function erpLink(Request $request, int $tid): ?array
    {
        if (($request->user()->role ?? null) !== 'admin') {
            return null;
        }
        $tenant = \App\Models\Tenant::query()->find($tid);
        $base = rtrim((string) config('services.webino.base_url', ''), '/');
        if (! $tenant?->crm_account_id || $base === '' || str_contains($base, 'localhost')) {
            return null;
        }

        return ['account_id' => (int) $tenant->crm_account_id, 'hub_url' => $base.'/crm/customers/'.$tenant->crm_account_id];
    }
}
