<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Modules\ModuleSettingsService;
use App\Services\Tenant\TenantResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GoogleOAuthController extends Controller
{
    public function __construct(protected ModuleSettingsService $settings) {}

    /** @return array<string, mixed> */
    protected function config(int $tenantId): array
    {
        $raw = $this->settings->get($tenantId, 'integrations', 'google_oauth', []);
        $defaults = [
            'enabled' => false,
            'client_id' => '',
            'client_secret' => '',
            'redirect_uri' => '',
            'has_client_secret' => false,
        ];
        if (! is_array($raw)) {
            return $defaults;
        }
        $secret = (string) ($raw['client_secret'] ?? '');
        $raw['has_client_secret'] = $secret !== '';
        if ($secret === '') {
            unset($raw['client_secret']);
        }

        return array_merge($defaults, $raw);
    }

    public function settingsShow(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;

        return response()->json(['data' => $this->config($tid)]);
    }

    public function settingsUpdate(Request $request): \Illuminate\Http\JsonResponse
    {
        $tid = (int) $request->user()->tenant_id;
        $current = $this->settings->get($tid, 'integrations', 'google_oauth', []);
        $data = $request->validate([
            'enabled' => ['nullable', 'boolean'],
            'client_id' => ['nullable', 'string', 'max:500'],
            'client_secret' => ['nullable', 'string', 'max:500'],
            'redirect_uri' => ['nullable', 'string', 'max:500'],
        ]);
        if (isset($data['client_secret']) && $data['client_secret'] === '••••••') {
            unset($data['client_secret']);
        }
        $merged = array_merge(is_array($current) ? $current : [], array_filter($data, fn ($v) => $v !== null));
        $this->settings->put($tid, 'integrations', 'google_oauth', $merged);

        return response()->json(['data' => $this->config($tid)]);
    }

    public function redirect(Request $request): \Illuminate\Http\RedirectResponse|\Illuminate\Http\JsonResponse
    {
        $tenant = app(TenantResolver::class)->identifyFromRequest($request);
        abort_if($tenant === null, 404);
        $cfg = $this->config((int) $tenant->id);
        abort_if(empty($cfg['enabled']) || ($cfg['client_id'] ?? '') === '', 503, 'google_oauth_disabled');
        $redirect = (string) ($cfg['redirect_uri'] ?? '');
        if ($redirect === '') {
            $redirect = rtrim((string) config('app.frontend_url', ''), '/').'/auth/google/callback';
        }
        $state = Str::random(40);
        cache()->put('google_oauth_state:'.$state, (int) $tenant->id, now()->addMinutes(10));
        $query = http_build_query([
            'client_id' => $cfg['client_id'],
            'redirect_uri' => $redirect,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'access_type' => 'online',
            'prompt' => 'select_account',
        ]);

        return redirect()->away('https://accounts.google.com/o/oauth2/v2/auth?'.$query);
    }

    public function callback(Request $request): \Illuminate\Http\RedirectResponse
    {
        $state = (string) $request->query('state', '');
        $code = (string) $request->query('code', '');
        $tenantId = (int) cache()->pull('google_oauth_state:'.$state, 0);
        abort_if($tenantId <= 0 || $code === '', 422);
        $cfg = $this->config($tenantId);
        $redirect = (string) ($cfg['redirect_uri'] ?? '');
        if ($redirect === '') {
            $redirect = rtrim((string) config('app.frontend_url', ''), '/').'/auth/google/callback';
        }
        $secret = (string) ($this->settings->get($tenantId, 'integrations', 'google_oauth', [])['client_secret'] ?? '');
        $tokenRes = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => $cfg['client_id'],
            'client_secret' => $secret,
            'redirect_uri' => $redirect,
            'grant_type' => 'authorization_code',
        ]);
        abort_unless($tokenRes->successful(), 422);
        $access = (string) data_get($tokenRes->json(), 'access_token');
        $profile = Http::withToken($access)->get('https://www.googleapis.com/oauth2/v3/userinfo');
        abort_unless($profile->successful(), 422);
        $email = (string) data_get($profile->json(), 'email');
        $name = (string) (data_get($profile->json(), 'name') ?: $email);
        abort_if($email === '', 422);

        $user = User::query()->firstOrCreate(
            ['tenant_id' => $tenantId, 'email' => $email],
            ['name' => $name, 'password' => bcrypt(Str::random(32)), 'role' => 'customer', 'is_active' => true]
        );
        $token = $user->createToken('google-oauth')->plainTextToken;
        $front = rtrim((string) config('app.frontend_url', '/'), '/');

        return redirect()
            ->away($front.'/login?oauth=1')
            ->cookie(
                config('auth.cookie_name', 'webino_auth_token'),
                $token,
                (int) config('auth.cookie_max_minutes', 60 * 24 * 7),
                '/',
                null,
                $request->secure(),
                true,
                false,
                'lax'
            );
    }
}
