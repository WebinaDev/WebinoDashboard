<?php

namespace App\Services\Bots\Engine;

use App\Models\LoyaltyLedger;
use App\Models\LoyaltyReward;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use App\Services\Shop\LoyaltyService;
use App\Services\Shop\ShopSettings;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** FAQ, tickets, loyalty club + daily check-in (WP bots-faq / bots-tickets / bots-loyalty / bots-club). */
final class AddonsFlow extends BotFlow
{
    /** @return list<array{q: string, a: string}> */
    private function faqItems(): array
    {
        $items = $this->ctx->meta()['faq'] ?? [];

        return array_values(array_filter((array) $items, fn ($i) => is_array($i) && trim((string) ($i['q'] ?? '')) !== '' && trim((string) ($i['a'] ?? '')) !== ''));
    }

    public function faq(): void
    {
        $items = $this->faqItems();
        if ($items === []) {
            $this->send('سوال متداولی ثبت نشده است.');

            return;
        }
        $rows = [];
        foreach (array_slice($items, 0, 30) as $i => $it) {
            $rows[] = [['text' => Str::limit((string) $it['q'], 60), 'callback_data' => 'f:'.$i]];
        }
        $this->send('❓ سوال خود را انتخاب کنید:', $rows);
    }

    public function faqAnswer(int $i): void
    {
        $it = $this->faqItems()[$i] ?? null;
        if (! $it) {
            return;
        }
        $kb = $this->ctx->addon('tickets') ? [[['text' => '🎫 پاسخم را نگرفتم — ثبت تیکت', 'callback_data' => 'tn']]] : null;
        $this->send('❓ '.$it['q']."\n\n".$it['a'], $kb);
    }

    /** Keyword auto-answer for free text (FAQ matching). */
    public function matchFaq(string $text): bool
    {
        if (! $this->ctx->addon('faq') || mb_strlen($text) < 3) {
            return false;
        }
        $needle = mb_strtolower($text);
        foreach ($this->faqItems() as $i => $it) {
            $keys = array_filter(array_map('trim', explode(',', (string) ($it['keywords'] ?? ''))));
            $keys[] = (string) $it['q'];
            foreach ($keys as $k) {
                $k = mb_strtolower($k);
                if ($k !== '' && (str_contains($needle, $k) || str_contains($k, $needle))) {
                    $this->faqAnswer($i);

                    return true;
                }
            }
        }

        return false;
    }

    // ---------- Tickets ----------

    public function support(): void
    {
        if (! $this->ctx->session->user_id) {
            $this->ctx->setState('link_contact');
            $this->send('برای پشتیبانی ابتدا حساب خود را متصل کنید.'."\n".$this->tpl('ask_contact'), null, $this->contactKeyboard());

            return;
        }
        $open = SupportTicket::query()->where('tenant_id', $this->ctx->tenantId())->where('user_id', $this->ctx->session->user_id)
            ->where('status', '!=', 'closed')->orderByDesc('updated_at')->limit(5)->get();
        $rows = [[['text' => '➕ تیکت جدید', 'callback_data' => 'tn']]];
        foreach ($open as $t) {
            $rows[] = [['text' => '#'.$t->id.' '.Str::limit((string) $t->subject, 30).' ('.self::ticketStatus((string) $t->status).')', 'callback_data' => 'tk:'.$t->id]];
        }
        $this->send('🎫 پشتیبانی', $rows);
    }

    public static function ticketStatus(string $s): string
    {
        return ['open' => 'باز', 'answered' => 'پاسخ داده شد', 'pending' => 'در انتظار', 'closed' => 'بسته'][$s] ?? $s;
    }

    public function newTicket(): void
    {
        if (! $this->ctx->session->user_id) {
            $this->support();

            return;
        }
        $this->ctx->setState('ticket_new', []);
        $this->send('موضوع و متن درخواست خود را در یک پیام بنویسید (انصراف: /cancel):');
    }

    public function showTicket(int $id): void
    {
        $t = $this->ownTicket($id);
        if (! $t) {
            return;
        }
        $replies = SupportTicketReply::query()->where('ticket_id', $t->id)->orderBy('id')->get()->take(-6);
        $text = '🎫 #'.$t->id.' '.$t->subject.' — '.self::ticketStatus((string) $t->status)."\n";
        foreach ($replies as $r) {
            $text .= "\n".($r->is_staff ? '👨‍💼 پشتیبان: ' : '👤 شما: ').Str::limit((string) $r->body, 400);
        }
        $kb = $t->status !== 'closed' ? [[['text' => '✍️ ارسال پاسخ', 'callback_data' => 'tw:'.$t->id]]] : null;
        $this->send($text, $kb);
    }

    public function startReply(int $id): void
    {
        if (! $this->ownTicket($id)) {
            return;
        }
        $this->ctx->setState('ticket_reply', ['ticket_id' => $id]);
        $this->send('پاسخ خود را بنویسید (انصراف: /cancel):');
    }

    private function ownTicket(int $id): ?SupportTicket
    {
        return SupportTicket::query()->where('tenant_id', $this->ctx->tenantId())->where('user_id', $this->ctx->session->user_id)->find($id);
    }

    public function handleTicketText(string $text): bool
    {
        $state = $this->ctx->state();
        if (! in_array($state, ['ticket_new', 'ticket_reply'], true)) {
            return false;
        }
        if ($text === '/cancel' || $text === 'انصراف') {
            $this->ctx->setState('', []);
            $this->send('لغو شد.', null, $this->mainMenu());

            return true;
        }
        if (mb_strlen(trim($text)) < 5) {
            $this->send('متن کوتاه است؛ کمی بیشتر توضیح دهید.');

            return true;
        }
        $uid = (int) $this->ctx->session->user_id;
        if ($state === 'ticket_new') {
            $t = SupportTicket::query()->create([
                'tenant_id' => $this->ctx->tenantId(),
                'user_id' => $uid,
                'subject' => Str::limit(strtok(trim($text), "\n") ?: trim($text), 120, ''),
                'status' => 'open',
            ]);
        } else {
            $t = $this->ownTicket((int) ($this->ctx->draft()['ticket_id'] ?? 0));
            if (! $t) {
                $this->ctx->setState('', []);

                return true;
            }
            $t->update(['status' => 'open']);
        }
        SupportTicketReply::query()->create(['tenant_id' => $t->tenant_id, 'ticket_id' => $t->id, 'user_id' => $uid, 'is_staff' => false, 'body' => trim($text)]);
        $this->ctx->setState('', []);
        $this->send('✅ تیکت #'.$t->id.' ثبت شد. پاسخ پشتیبانی همین‌جا ارسال می‌شود.', null, $this->mainMenu());
        foreach (AdminFlow::adminChats($this->ctx->meta()) as $chat) {
            BotMessenger::call($this->ctx->tenantId(), $this->ctx->provider(), $this->ctx->client, 'sendMessage', [
                'chat_id' => $chat,
                'text' => '🎫 پیام جدید در تیکت #'.$t->id.' — '.$t->subject."\n\n".Str::limit(trim($text), 600),
                'reply_markup' => ['inline_keyboard' => [[['text' => '✍️ پاسخ', 'callback_data' => 'tr:'.$t->id]]]],
            ]);
        }

        return true;
    }

    // ---------- Loyalty / club ----------

    public function loyalty(): void
    {
        $user = $this->ctx->user();
        if (! $user) {
            $this->ctx->setState('link_contact');
            $this->send('برای باشگاه مشتریان ابتدا حساب خود را متصل کنید.'."\n".$this->tpl('ask_contact'), null, $this->contactKeyboard());

            return;
        }
        $settings = ShopSettings::getLoyalty($this->ctx->tenantId());
        if (empty($settings['enabled'])) {
            $this->send('باشگاه مشتریان فعال نیست.');

            return;
        }
        $rewards = LoyaltyReward::query()->where('tenant_id', $this->ctx->tenantId())->where('is_active', true)->orderBy('points_cost')->limit(10)->get();
        $rows = [];
        foreach ($rewards as $r) {
            $rows[] = [['text' => '🎁 '.$r->title.' — '.$r->points_cost.' امتیاز', 'callback_data' => 'lr:'.$r->id]];
        }
        if ((int) ($this->ctx->meta()['club']['daily_points'] ?? 0) > 0) {
            $rows[] = [['text' => '📅 امتیاز روزانه', 'callback_data' => 'daily']];
        }
        $this->send('🎁 باشگاه مشتریان'."\n\nامتیاز فعلی شما: ".(int) $user->loyalty_points.($rows ? "\n\nجوایز قابل دریافت:" : ''), $rows ?: null);
    }

    public function redeem(int $rewardId): void
    {
        $user = $this->ctx->user();
        if (! $user) {
            return;
        }
        try {
            $res = app(LoyaltyService::class)->redeem($this->ctx->tenantId(), $user, $rewardId);
        } catch (ValidationException $e) {
            $this->send(isset($e->errors()['points']) ? 'امتیاز شما برای این جایزه کافی نیست.' : 'دریافت جایزه ممکن نشد.');

            return;
        } catch (\Throwable) {
            $this->send('دریافت جایزه ممکن نشد.');

            return;
        }
        $code = (string) ($res['coupon_code'] ?? $res['code'] ?? '');
        $this->send('🎉 جایزه فعال شد.'.($code !== '' ? "\nکد تخفیف شما: ".$code : ''));
    }

    public function daily(): void
    {
        $user = $this->ctx->user();
        $points = (int) ($this->ctx->meta()['club']['daily_points'] ?? 0);
        if (! $user || $points <= 0) {
            return;
        }
        $done = LoyaltyLedger::query()->where('user_id', $user->id)->where('reason', 'bot_daily')->where('created_at', '>=', now()->startOfDay())->exists();
        if ($done) {
            $this->send('امتیاز امروز را قبلاً گرفته‌اید؛ فردا دوباره سر بزنید. 🙂');

            return;
        }
        app(LoyaltyService::class)->grant($user, $points, 'bot_daily');
        $this->send('✅ '.$points.' امتیاز روزانه به حساب شما اضافه شد.');
    }
}
