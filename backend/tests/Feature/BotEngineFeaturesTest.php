<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\BotChannelPost;
use App\Models\BotSession;
use App\Models\BotSetting;
use App\Models\LoyaltyLedger;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Bots\BotClientFactory;
use App\Services\Bots\Engine\BotPoller;
use App\Services\Bots\Engine\ChannelPublisher;
use App\Services\Bots\FailoverBotClient;
use App\Services\Shop\ShopSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BotEngineFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private BotSetting $setting;

    /** @var list<string> */
    private array $apiMethods = [];

    /** @var array<string, string> chat_id => membership status */
    private array $membership = [];

    protected function setUp(): void
    {
        parent::setUp();
        $tenant = Tenant::query()->create([
            'name' => 'BotFeat', 'slug' => 'bot-feat', 'domain' => 'bot-feat.test', 'license_key' => 'lic-feat',
            'setup_completed' => true, 'store_display_name' => 'فروشگاه فیچر', 'default_currency' => 'IRT',
        ]);
        $this->enableSubmodules($tenant->id, [
            'bots.bale' => true, 'bots.telegram' => true, 'commerce.checkout' => true, 'commerce.cart' => true, 'commerce.catalog' => true,
        ]);
        User::factory()->create(['tenant_id' => $tenant->id, 'role' => 'admin']);
        $this->setting = BotSetting::query()->create([
            'tenant_id' => $tenant->id,
            'provider' => 'bale',
            'enabled' => true,
            'token' => 'primary-tok',
            'webhook_secret' => 'sec',
            'meta' => [
                'bot_username' => 'featbot',
                'addons' => [],
            ],
        ]);
        $this->fakeBaleApi();
    }

    private function fakeBaleApi(?callable $extra = null): void
    {
        $this->apiMethods = [];
        // Replace the HTTP client factory so repeated fakes do not stack (Laravel merges stubs).
        $factory = new \Illuminate\Http\Client\Factory;
        Http::swap($factory);
        $factory->fake([
            'tapi.bale.ai/*' => function (HttpRequest $request) use ($extra) {
                if ($extra) {
                    $override = $extra($request);
                    if ($override !== null) {
                        return $override;
                    }
                }
                $method = (string) str($request->url())->afterLast('/');
                $this->apiMethods[] = $method;
                if ($method === 'getChatMember') {
                    $uid = (string) ($request['user_id'] ?? '');
                    $status = $this->membership[$uid] ?? 'left';

                    return Http::response(['ok' => true, 'result' => ['status' => $status]], 200);
                }
                if ($method === 'getUpdates') {
                    return Http::response(['ok' => true, 'result' => []], 200);
                }

                return Http::response(['ok' => true, 'result' => ['message_id' => 1, 'username' => 'featbot', 'id' => 1]], 200);
            },
        ]);
    }

    private function msg(array $message, string $chat = '555'): void
    {
        $message['chat'] = ['id' => $chat];
        $message['from'] = $message['from'] ?? ['id' => (int) $chat, 'first_name' => 'علی'];
        $this->postJson('/api/v1/public/bots/bale/webhook', ['message' => $message], ['X-Bot-Secret' => 'sec'])->assertOk();
    }

    private function cb(string $data, string $chat = '555'): void
    {
        $this->postJson('/api/v1/public/bots/bale/webhook', ['callback_query' => [
            'id' => 'q1', 'data' => $data, 'from' => ['id' => (int) $chat, 'first_name' => 'علی'],
            'message' => ['chat' => ['id' => $chat]],
        ]], ['X-Bot-Secret' => 'sec'])->assertOk();
    }

    public function test_force_join_blocks_until_membership_confirmed(): void
    {
        $this->membership['555'] = 'left';
        $meta = $this->setting->meta;
        $meta['addons']['force_join'] = true;
        $meta['force_join'] = [
            'enabled' => true,
            'mode' => 'mandatory',
            'channel_id' => '@chan',
            'channel_link' => 'https://ble.ir/chan',
            'message' => 'عضو کانال شوید',
            'check_button_text' => 'بررسی',
        ];
        $this->setting->update(['meta' => $meta]);

        $this->msg(['text' => '/start']);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/sendMessage')
            && str_contains((string) ($r->data()['text'] ?? ''), 'عضو کانال شوید'));
        $this->assertNull(data_get(BotSession::query()->where('chat_id', '555')->first()?->meta, 'force_join_ok'));

        $this->cb('fj:check');
        $this->assertNull(data_get(BotSession::query()->where('chat_id', '555')->first()?->meta, 'force_join_ok'));

        $this->membership['555'] = 'member';
        $this->cb('fj:check');
        $this->assertTrue((bool) data_get(BotSession::query()->where('chat_id', '555')->first()?->meta, 'force_join_ok'));
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/sendMessage')
            && str_contains((string) ($r->data()['text'] ?? ''), 'فروشگاه فیچر'));
    }

    public function test_page_builder_menu_labels_and_home_blocks(): void
    {
        $meta = $this->setting->meta;
        $meta['page_builder'] = [
            'menu' => ['search' => false, 'store' => true],
            'labels' => ['store' => '🛒 فروشگاه ویژه'],
            'home_blocks' => "بلوک خانه\nخط دوم",
        ];
        $this->setting->update(['meta' => $meta]);

        $this->msg(['text' => '/start']);
        Http::assertSent(function (HttpRequest $r) {
            if (! str_ends_with($r->url(), '/sendMessage')) {
                return false;
            }
            $text = (string) ($r->data()['text'] ?? '');
            $kb = json_encode($r->data()['reply_markup'] ?? [], JSON_UNESCAPED_UNICODE);

            return str_contains($text, 'بلوک خانه')
                && str_contains($kb, '🛒 فروشگاه ویژه')
                && ! str_contains($kb, '🔎 جستجو');
        });

        $this->msg(['text' => '🛒 فروشگاه ویژه']);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/sendMessage')
            && (
                str_contains((string) ($r->data()['text'] ?? ''), 'دسته‌')
                || str_contains((string) ($r->data()['text'] ?? ''), 'محصول')
                || str_contains(json_encode($r->data()['reply_markup'] ?? [], JSON_UNESCAPED_UNICODE), 'c:')
            ));
    }

    public function test_webapp_buttons_and_menu_sync_on_settings_save(): void
    {
        $admin = User::query()->where('tenant_id', $this->setting->tenant_id)->where('role', 'admin')->first();
        $this->actingAs($admin, 'sanctum');
        $this->putJson('/api/v1/bots/bale/settings', [
            'meta' => [
                'addons' => ['webapp' => true],
                'widget' => ['webapp_url' => 'https://shop.test/app'],
                'club' => ['webapp_base_url' => 'https://shop.test/app'],
            ],
        ])->assertOk();
        $this->assertContains('setChatMenuButton', $this->apiMethods);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/setChatMenuButton')
            && data_get($r->data(), 'menu_button.type') === 'web_app'
            && data_get($r->data(), 'menu_button.web_app.url') === 'https://shop.test/app');

        $this->setting->refresh();
        $this->assertSame('https://shop.test/app', \App\Services\Bots\Engine\BotFlow::resolveWebappUrl(
            new \App\Services\Bots\Engine\BotContext(
                $this->setting,
                BotSession::query()->firstOrCreate(
                    ['tenant_id' => $this->setting->tenant_id, 'provider' => 'bale', 'chat_id' => '1'],
                    ['last_seen_at' => now()]
                ),
                BotClientFactory::forSetting($this->setting),
                '1',
                ['id' => 1]
            )
        ));

        $this->msg(['text' => '/start']);
        Http::assertSent(function (HttpRequest $r) {
            if (! str_ends_with($r->url(), '/sendMessage')) {
                return false;
            }
            $markup = json_encode($r->data()['reply_markup'] ?? [], JSON_UNESCAPED_UNICODE);

            return str_contains($markup, 'https://shop.test/app') || str_contains($markup, 'web_app');
        });
    }

    public function test_referral_invite_attribution_and_points(): void
    {
        ShopSettings::saveLoyalty($this->setting->tenant_id, [
            'enabled' => true,
            'referral_points' => 50,
        ]);
        $meta = $this->setting->meta;
        $meta['addons']['referral'] = true;
        $meta['addons']['loyalty'] = true;
        $meta['referral'] = ['enabled' => true, 'points' => 40, 'welcome_bonus' => 10];
        $this->setting->update(['meta' => $meta]);

        $referrer = User::factory()->create([
            'tenant_id' => $this->setting->tenant_id,
            'role' => 'customer',
            'loyalty_points' => 0,
            'phone' => '09120000001',
        ]);
        BotSession::query()->create([
            'tenant_id' => $this->setting->tenant_id,
            'provider' => 'bale',
            'chat_id' => '100',
            'user_id' => $referrer->id,
            'last_seen_at' => now(),
            'meta' => [],
        ]);

        $this->msg(['text' => '/start ref_100'], '200');
        $inviteeSession = BotSession::query()->where('chat_id', '200')->firstOrFail();
        $this->assertSame('100', data_get($inviteeSession->meta, 'referred_by_chat_id'));

        $this->msg(['contact' => ['phone_number' => '09123334455', 'user_id' => 200, 'first_name' => 'مهمان']], '200');
        $invitee = User::query()->findOrFail($inviteeSession->fresh()->user_id);
        $this->assertTrue(LoyaltyLedger::query()->where('user_id', $invitee->id)->where('reason', 'bot_ref_welcome:100')->exists());
        $this->assertTrue(LoyaltyLedger::query()->where('user_id', $referrer->id)->where('reason', 'bot_referral:'.$invitee->id)->exists());
        $this->assertSame(40, (int) $referrer->fresh()->loyalty_points);
        $this->assertSame(10, (int) $invitee->fresh()->loyalty_points);

        $this->msg(['text' => '/invite'], '100');
        Http::assertSent(fn (HttpRequest $r) => str_contains((string) ($r->data()['text'] ?? ''), 'ble.ir/featbot')
            && str_contains((string) ($r->data()['text'] ?? ''), 'ref_100'));
    }

    public function test_blog_channel_auto_and_manual_publish(): void
    {
        $meta = $this->setting->meta;
        $meta['addons']['channel_publish'] = true;
        $meta['channel'] = [
            'channel_id' => '@blogchan',
            'auto_new_blog' => true,
            'blog_template' => '📝 {title}',
            'auto_delay_minutes' => 0,
        ];
        $this->setting->update(['meta' => $meta]);

        $blog = BlogPost::query()->create([
            'tenant_id' => $this->setting->tenant_id,
            'title' => 'خبر تست',
            'slug' => 'news-test',
            'excerpt' => 'خلاصه',
            'body' => '<p>بدنه</p>',
            'status' => 'published',
            'published_at' => now(),
        ]);
        $post = BotChannelPost::query()->where('blog_post_id', $blog->id)->firstOrFail();
        $this->assertSame('auto', $post->source);
        $this->assertSame(1, ChannelPublisher::publishDue());
        $this->assertSame('published', $post->fresh()->status);

        $admin = User::query()->where('tenant_id', $this->setting->tenant_id)->where('role', 'admin')->first();
        $this->actingAs($admin, 'sanctum');
        $this->postJson('/api/v1/bots/bale/channel-posts', [
            'blog_post_id' => $blog->id,
            'publish_now' => true,
        ])->assertCreated();
        $this->assertGreaterThanOrEqual(2, BotChannelPost::query()->where('blog_post_id', $blog->id)->count());
    }

    public function test_mirror_token_failover_on_primary_failure(): void
    {
        $meta = $this->setting->meta;
        $meta['connection'] = ['mirror_token' => 'mirror-tok'];
        $this->setting->update(['meta' => $meta]);
        $row = $this->setting->fresh();
        $this->assertSame(['mirror-tok'], BotClientFactory::mirrorTokens($row->meta['connection'] ?? []));

        $primary = new class implements \App\Services\Bots\BotClient
        {
            public int $calls = 0;

            public function call(string $method, array $payload): array
            {
                $this->calls++;

                return ['ok' => false, 'body' => ['description' => 'down'], 'status' => 500];
            }

            public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
            {
                return $this->call('sendMessage', []);
            }
        };
        $mirror = new class implements \App\Services\Bots\BotClient
        {
            public int $calls = 0;

            public function call(string $method, array $payload): array
            {
                $this->calls++;

                return ['ok' => true, 'body' => ['result' => ['message_id' => 9]], 'status' => 200];
            }

            public function sendMessage(string $chatId, string $type, string $text, ?string $media = null): array
            {
                return $this->call('sendMessage', []);
            }
        };

        $failover = new FailoverBotClient([$primary, $mirror]);
        $res = $failover->call('sendMessage', ['chat_id' => '1', 'text' => 'hi']);
        $this->assertTrue($res['ok']);
        $this->assertSame(1, $primary->calls);
        $this->assertSame(1, $mirror->calls);
        $this->assertInstanceOf(FailoverBotClient::class, BotClientFactory::forSetting($row));
    }

    public function test_poller_handles_get_updates_when_mode_is_polling(): void
    {
        $meta = $this->setting->meta;
        $meta['connection'] = ['mode' => 'polling', 'poll_webhook_cleared' => true, 'poll_offset' => 0];
        $this->setting->update(['meta' => $meta]);
        $row = $this->setting->fresh();
        $this->assertSame('polling', data_get($row->meta, 'connection.mode'));

        $this->fakeBaleApi(function (HttpRequest $request) {
            if (str_contains($request->url(), 'getUpdates')) {
                return Http::response([
                    'ok' => true,
                    'result' => [[
                        'update_id' => 42,
                        'message' => [
                            'message_id' => 1,
                            'chat' => ['id' => 777],
                            'from' => ['id' => 777, 'first_name' => 'پول'],
                            'text' => '/start',
                        ],
                    ]],
                ], 200);
            }

            return null;
        });

        $n = app(BotPoller::class)->pollOne($row);
        $this->assertSame(1, $n);
        $fresh = $row->fresh();
        $this->assertSame('polling', data_get($fresh->meta, 'connection.mode'));
        $this->assertSame(43, (int) data_get($fresh->meta, 'connection.poll_offset'));
        $this->assertNotNull(BotSession::query()->where('chat_id', '777')->first());
    }
}
