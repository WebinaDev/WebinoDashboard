<?php

namespace App\Http\Controllers\Api\V1\Erp;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\SupportTicket;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * ERP Customer 360 Hub ⇄ site panel link. Server-to-server only (VerifyErpLinkSignature).
 * Never returns bank numbers or secrets; only what the ERP hub needs to show.
 */
class ErpLinkController extends Controller
{
    private const PAID = ['paid', 'processing', 'shipped', 'completed'];

    public function __construct(private readonly TenantResolver $resolver) {}

    private function tenant(Request $r): Tenant
    {
        $t = $this->resolver->resolveFromRequest($r);
        abort_unless($t, 404, 'tenant_not_found');

        return $t;
    }

    private function panelUrl(Tenant $t, string $path = ''): ?string
    {
        return $t->domain ? 'https://'.$t->domain.'/dashboard'.$path : null;
    }

    /** Orders, tickets and KYC for one customer, found by ERP account id (site owner), email or phone. */
    public function customer(Request $r): JsonResponse
    {
        $data = $r->validate([
            'email' => 'nullable|string|max:255', 'phone' => 'nullable|string|max:32',
            'erp_customer_id' => 'nullable|integer', 'limit' => 'nullable|integer|min:1|max:50',
        ]);
        $t = $this->tenant($r);
        $limit = (int) ($data['limit'] ?? 10);
        $owner = ! empty($data['erp_customer_id']) && (int) $t->crm_account_id === (int) $data['erp_customer_id'];

        $users = User::query()->where('tenant_id', $t->id)->where(function ($q) use ($data) {
            $any = false;
            if (! empty($data['email'])) {
                $q->orWhereRaw('lower(email) = ?', [mb_strtolower(trim($data['email']))]);
                $any = true;
            }
            if (! empty($data['phone'])) {
                $digits = preg_replace('/\D+/', '', $data['phone']);
                $tail = substr($digits, -10);
                if ($tail !== '') {
                    $q->orWhere('phone', 'like', '%'.$tail);
                    $any = true;
                }
            }
            if (! $any) {
                $q->whereRaw('1 = 0');
            }
        })->limit(5)->get();

        $matches = $users->map(function (User $u) use ($t, $limit) {
            $orders = Order::query()->where('tenant_id', $t->id)->where('user_id', $u->id);
            $tickets = SupportTicket::query()->where('tenant_id', $t->id)->where('user_id', $u->id);
            $paid = (clone $orders)->whereIn('status', self::PAID);

            return [
                'user' => $u->only(['id', 'name', 'email', 'phone', 'role', 'is_active', 'kyc_status', 'kyc_verified_at', 'created_at']),
                'kyc' => ['status' => $u->kyc_status ?? 'none', 'verified_at' => $u->kyc_verified_at],
                'stats' => [
                    'orders_count' => (clone $orders)->count(),
                    'paid_orders_count' => (clone $paid)->count(),
                    'total_spent_minor' => (int) (clone $paid)->sum('total_minor'),
                    'open_tickets' => (clone $tickets)->whereNotIn('status', ['closed', 'resolved'])->count(),
                ],
                'orders' => (clone $orders)->latest('id')->limit($limit)->get(['id', 'number', 'status', 'total_minor', 'currency', 'created_at']),
                'tickets' => (clone $tickets)->latest('id')->limit($limit)->get(['id', 'subject', 'status', 'created_at']),
                'panel_url' => $this->panelUrl($t, $u->role === 'customer' ? '/customers?'.http_build_query(['q' => (string) $u->email, 'open' => $u->id]) : '/users'),
            ];
        })->values();

        $site = null;
        if ($owner) {
            // The ERP customer owns this site: give site-wide orders/tickets too.
            $site = [
                'orders_count' => Order::query()->where('tenant_id', $t->id)->count(),
                'revenue_minor' => (int) Order::query()->where('tenant_id', $t->id)->whereIn('status', self::PAID)->sum('total_minor'),
                'open_tickets' => SupportTicket::query()->where('tenant_id', $t->id)->whereNotIn('status', ['closed', 'resolved'])->count(),
                'recent_orders' => Order::query()->where('tenant_id', $t->id)->latest('id')->limit($limit)->get(['id', 'number', 'status', 'total_minor', 'currency', 'created_at']),
                'recent_tickets' => SupportTicket::query()->where('tenant_id', $t->id)->latest('id')->limit($limit)->get(['id', 'subject', 'status', 'created_at']),
            ];
        }

        return response()->json(['data' => [
            'tenant' => ['domain' => $t->domain, 'name' => $t->name, 'license_status' => $t->normalizedLicenseStatus(), 'suspended' => $t->suspended_at !== null],
            'is_owner_site' => $owner,
            'matches' => $matches,
            'site' => $site,
            'panel_url' => $this->panelUrl($t),
        ]]);
    }

    /** Usage counters for the ERP usage collector. */
    public function usage(Request $r): JsonResponse
    {
        $t = $this->tenant($r);
        $orders = Order::query()->where('tenant_id', $t->id);
        $sms = 0;
        foreach (['sms_secretary_logs', 'sms_scheduled_sends'] as $tbl) {
            if (Schema::hasTable($tbl) && Schema::hasColumn($tbl, 'tenant_id')) {
                $sms += DB::table($tbl)->where('tenant_id', $t->id)->count();
            }
        }

        return response()->json(['data' => [
            'period' => now()->toDateString(),
            'metrics' => [
                'orders' => (clone $orders)->count(),
                'orders_30d' => (clone $orders)->where('created_at', '>=', now()->subDays(30))->count(),
                'customers' => User::query()->where('tenant_id', $t->id)->where('role', 'customer')->count(),
                'panel_users' => User::query()->where('tenant_id', $t->id)->where('role', '!=', 'customer')->count(),
                'open_tickets' => SupportTicket::query()->where('tenant_id', $t->id)->whereNotIn('status', ['closed', 'resolved'])->count(),
                'sms_sent' => $sms,
                'storage_mb' => $this->storageMb(),
            ],
        ]]);
    }

    private function storageMb(): float
    {
        return (float) Cache::remember('erp_link:storage_mb', 3600, function () {
            $bytes = 0;
            $root = storage_path('app');
            if (! is_dir($root)) {
                return 0;
            }
            try {
                $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
                foreach ($it as $f) {
                    $bytes += $f->isFile() ? $f->getSize() : 0;
                }
            } catch (\Throwable) {
            }

            return round($bytes / 1048576, 2);
        });
    }

    /** Suspend / reactivate the whole site (reversible). */
    public function suspension(Request $r): JsonResponse
    {
        $data = $r->validate(['suspended' => 'required|boolean', 'reason' => 'nullable|string|max:1000']);
        $t = $this->tenant($r);
        $t->forceFill([
            'suspended_at' => $data['suspended'] ? ($t->suspended_at ?? now()) : null,
            'suspension_reason' => $data['suspended'] ? ($data['reason'] ?? null) : null,
        ])->save();
        Log::info('erp_link.suspension', ['tenant' => $t->id, 'suspended' => $data['suspended']]);

        return response()->json(['data' => ['suspended' => $t->suspended_at !== null, 'suspended_at' => $t->suspended_at]]);
    }
}
