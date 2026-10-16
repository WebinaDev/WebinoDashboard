<?php

namespace App\Services\Bots\Engine;

use App\Http\Controllers\Api\V1\CheckoutController;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\Orders\OrderShippingStatuses;
use App\Services\Payments\PaymentCheckoutService;
use App\Services\Payments\PaymentGatewaySettingsService;
use App\Services\Shipping\ShippingZonesService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Store / cart / checkout / payment / account flows
 * (port of WP bale-bot engine StoreFlow, CartFlow, CheckoutFlow, PaymentHandler, AccountFlow).
 */
final class ShopFlow extends BotFlow
{
    public const PER_PAGE = 6;

    public const ONLINE_GATEWAYS = ['zarinpal', 'zibal', 'digipay', 'snapppay', 'torobpay', 'bale_pay'];

    // ---------- Store ----------

    public function categories(): void
    {
        $cats = Category::query()->where('tenant_id', $this->ctx->tenantId())
            ->whereNull('parent_id')->orderBy('sort_order')->orderBy('id')->limit(30)->get(['id', 'name']);
        if ($cats->isEmpty()) {
            $this->products(0, 1);

            return;
        }
        $rows = [];
        foreach ($cats->chunk(2) as $chunk) {
            $rows[] = $chunk->map(fn ($c) => ['text' => (string) $c->name, 'callback_data' => 'c:'.$c->id.':1'])->values()->all();
        }
        $rows[] = [['text' => 'همهٔ محصولات', 'callback_data' => 'c:0:1']];
        $this->send('دسته‌بندی را انتخاب کنید:', $rows);
    }

    public function products(int $categoryId, int $page, ?string $search = null): void
    {
        $q = Product::query()->where('tenant_id', $this->ctx->tenantId())->storefront()->orderByDesc('id');
        if ($categoryId > 0) {
            $q->where(function ($w) use ($categoryId) {
                $w->where('category_id', $categoryId)
                    ->orWhereHas('categories', fn ($c) => $c->where('categories.id', $categoryId));
            });
        }
        if ($search !== null && $search !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
            $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like));
        }
        $total = (clone $q)->count();
        if ($total === 0) {
            $this->send($search !== null ? 'محصولی با این عبارت پیدا نشد.' : 'فعلاً محصولی در این بخش نیست.');

            return;
        }
        $page = max(1, $page);
        $items = $q->forPage($page, self::PER_PAGE)->get(['id', 'name', 'price_minor', 'sale_price_minor', 'sale_starts_at', 'sale_ends_at', 'currency']);
        $rows = [];
        foreach ($items as $p) {
            $rows[] = [['text' => $p->name.' — '.self::money($p->storefrontPriceMinor(), (string) $p->currency), 'callback_data' => 'p:'.$p->id]];
        }
        $pages = (int) ceil($total / self::PER_PAGE);
        $nav = [];
        if ($search === null) {
            if ($page > 1) {
                $nav[] = ['text' => '◀️ قبلی', 'callback_data' => 'c:'.$categoryId.':'.($page - 1)];
            }
            if ($page < $pages) {
                $nav[] = ['text' => 'بعدی ▶️', 'callback_data' => 'c:'.$categoryId.':'.($page + 1)];
            }
        }
        if ($nav !== []) {
            $rows[] = $nav;
        }
        $this->send('محصولات (صفحهٔ '.$page.' از '.$pages.'):', $rows);
    }

    public function product(int $id): void
    {
        $p = Product::query()->where('tenant_id', $this->ctx->tenantId())->storefront()->find($id);
        if (! $p) {
            $this->send('این محصول در دسترس نیست.');

            return;
        }
        $price = self::money($p->storefrontPriceMinor(), (string) $p->currency);
        if ($p->isOnSale()) {
            $price = self::money($p->regularPriceMinor(), (string) $p->currency).' ← '.$price.' 🔥';
        }
        $desc = trim(strip_tags((string) ($p->short_description ?: $p->description)));
        $text = $p->name."\n💰 ".$price.($desc !== '' ? "\n\n".Str::limit($desc, 600) : '');
        $kb = [
            [['text' => '➕ افزودن به سبد', 'callback_data' => 'a:'.$p->id]],
            [['text' => '🛒 مشاهدهٔ سبد', 'callback_data' => 'cart']],
        ];
        if ($p->slug) {
            $kb[] = [['text' => '🌐 مشاهده در سایت', 'url' => $this->siteUrl().'/product/'.$p->slug]];
        }
        if ($p->image_url && str_starts_with((string) $p->image_url, 'http')) {
            $res = $this->sendPhoto((string) $p->image_url, Str::limit($text, 1000), $kb);
            if (! empty($res['ok'])) {
                return;
            }
        }
        $this->send($text, $kb);
    }

    // ---------- Cart ----------

    public function cart(): Cart
    {
        $tid = $this->ctx->tenantId();
        $guest = 'bot:'.$this->ctx->provider().':'.$this->ctx->chatId;
        if ($this->ctx->session->user_id) {
            $cart = Cart::query()->firstOrCreate(['tenant_id' => $tid, 'user_id' => $this->ctx->session->user_id]);
            // Merge the pre-login bot cart.
            $guestCart = Cart::query()->where('tenant_id', $tid)->whereNull('user_id')->where('guest_token', $guest)->first();
            if ($guestCart) {
                foreach (CartItem::query()->where('cart_id', $guestCart->id)->get() as $line) {
                    $this->addLine($cart, (int) $line->product_id, (int) $line->quantity);
                }
                CartItem::query()->where('cart_id', $guestCart->id)->delete();
                $guestCart->delete();
            }
        } else {
            $cart = Cart::query()->firstOrCreate(['tenant_id' => $tid, 'user_id' => null, 'guest_token' => $guest]);
        }
        $meta = is_array($cart->meta) ? $cart->meta : [];
        if (($meta['bot_provider'] ?? null) !== $this->ctx->provider() || ($meta['bot_chat_id'] ?? null) !== $this->ctx->chatId) {
            $meta['bot_provider'] = $this->ctx->provider();
            $meta['bot_chat_id'] = $this->ctx->chatId;
            $cart->meta = $meta;
            $cart->save();
        }

        return $cart;
    }

    private function addLine(Cart $cart, int $productId, int $qty): void
    {
        $line = CartItem::query()->where('cart_id', $cart->id)->where('product_id', $productId)->whereNull('line_key')->first();
        if ($line) {
            $line->update(['quantity' => max(1, $line->quantity + $qty)]);
        } else {
            CartItem::query()->create(['cart_id' => $cart->id, 'product_id' => $productId, 'quantity' => max(1, $qty), 'purchase_type' => 'cash']);
        }
        $cart->touch();
        $this->clearRecovery($cart);
    }

    private function clearRecovery(Cart $cart): void
    {
        $meta = is_array($cart->meta) ? $cart->meta : [];
        unset($meta['recovery_stage'], $meta['recovery_activity'], $meta['recovery_last_at']);
        $cart->meta = $meta;
        $cart->save();
    }

    public function add(int $productId): void
    {
        $p = Product::query()->where('tenant_id', $this->ctx->tenantId())->storefront()->find($productId);
        if (! $p) {
            $this->send('این محصول در دسترس نیست.');

            return;
        }
        $this->addLine($this->cart(), $p->id, 1);
        $this->send('✅ «'.$p->name.'» به سبد اضافه شد.', [[
            ['text' => '🛒 مشاهدهٔ سبد', 'callback_data' => 'cart'],
            ['text' => '🛍 ادامهٔ خرید', 'callback_data' => 'cats'],
        ]]);
    }

    public function changeQty(int $productId, int $delta): void
    {
        $cart = $this->cart();
        $line = CartItem::query()->where('cart_id', $cart->id)->where('product_id', $productId)->first();
        if ($line) {
            $q = $line->quantity + $delta;
            $q <= 0 ? $line->delete() : $line->update(['quantity' => $q]);
            $cart->touch();
        }
        $this->showCart();
    }

    public function clear(): void
    {
        CartItem::query()->where('cart_id', $this->cart()->id)->delete();
        $this->send($this->tpl('cart_empty'));
    }

    /** @return array{lines: \Illuminate\Support\Collection, subtotal: int, currency: string} */
    public function cartSummary(Cart $cart): array
    {
        $lines = CartItem::query()->where('cart_id', $cart->id)->with('product')->get()->filter(fn ($l) => $l->product !== null)->values();
        $subtotal = 0;
        $currency = 'IRT';
        foreach ($lines as $l) {
            $subtotal += $l->product->storefrontPriceMinor() * $l->quantity;
            $currency = (string) ($l->product->currency ?: 'IRT');
        }

        return ['lines' => $lines, 'subtotal' => $subtotal, 'currency' => $currency];
    }

    public function showCart(): void
    {
        $sum = $this->cartSummary($this->cart());
        if ($sum['lines']->isEmpty()) {
            $this->send($this->tpl('cart_empty'), [[['text' => '🛍 رفتن به فروشگاه', 'callback_data' => 'cats']]]);

            return;
        }
        $text = "🛒 سبد خرید شما:\n";
        $kb = [];
        foreach ($sum['lines'] as $l) {
            $text .= "\n• ".$l->product->name.' × '.$l->quantity.' = '.self::money($l->product->storefrontPriceMinor() * $l->quantity, $sum['currency']);
            $kb[] = [
                ['text' => '➖', 'callback_data' => 'cd:'.$l->product_id],
                ['text' => Str::limit((string) $l->product->name, 18).' ('.$l->quantity.')', 'callback_data' => 'p:'.$l->product_id],
                ['text' => '➕', 'callback_data' => 'ci:'.$l->product_id],
            ];
        }
        $text .= "\n\nجمع: ".self::money($sum['subtotal'], $sum['currency']);
        $kb[] = [['text' => '✅ ادامه و ثبت سفارش', 'callback_data' => 'co']];
        $kb[] = [['text' => '🗑 خالی کردن سبد', 'callback_data' => 'cx']];
        $this->send($text, $kb);
    }

    // ---------- Account linking ----------

    /** Link the chat to a store customer by verified contact (must be the sender's own contact). */
    public function linkContact(array $contact): ?User
    {
        $fromId = (string) ($this->ctx->from['id'] ?? '');
        if (isset($contact['user_id']) && $fromId !== '' && (string) $contact['user_id'] !== $fromId) {
            $this->send('لطفاً شمارهٔ خودتان را با دکمهٔ «ارسال شماره موبایل» بفرستید.', null, $this->contactKeyboard());

            return null;
        }
        $phone = self::normalizePhone((string) ($contact['phone_number'] ?? ''));
        if ($phone === '') {
            $this->send('شمارهٔ موبایل معتبر نیست.');

            return null;
        }
        $tid = $this->ctx->tenantId();
        $user = User::query()->where('tenant_id', $tid)->where('phone', $phone)->first();
        if (! $user) {
            $email = $phone.'@otp.local';
            if (User::query()->where('email', $email)->exists()) {
                $email = $phone.'.'.$tid.'@bot.local';
            }
            $user = new User;
            $user->forceFill([
                'tenant_id' => $tid,
                'name' => trim(($contact['first_name'] ?? '').' '.($contact['last_name'] ?? '')) ?: $phone,
                'email' => $email,
                'phone' => $phone,
                'password' => Str::password(24),
                'role' => 'customer',
                'is_active' => true,
                'password_must_change' => false,
            ])->save();
        }
        $this->ctx->session->user_id = $user->id;
        $this->ctx->session->save();
        $this->cart(); // merge guest cart

        return $user;
    }

    public static function normalizePhone(string $raw): string
    {
        $d = preg_replace('/\D+/', '', strtr($raw, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']));
        if (str_starts_with($d, '0098')) {
            $d = substr($d, 4);
        } elseif (str_starts_with($d, '98')) {
            $d = substr($d, 2);
        }
        if (str_starts_with($d, '9') && strlen($d) === 10) {
            $d = '0'.$d;
        }

        return preg_match('/^09\d{9}$/', $d) ? $d : '';
    }

    // ---------- Checkout ----------

    public function startCheckout(): void
    {
        $sum = $this->cartSummary($this->cart());
        if ($sum['lines']->isEmpty()) {
            $this->send($this->tpl('cart_empty'));

            return;
        }
        if (! $this->ctx->session->user_id) {
            $this->ctx->setState('checkout_contact', []);
            $this->send($this->tpl('ask_contact'), null, $this->contactKeyboard());

            return;
        }
        $this->askName();
    }

    public function askName(): void
    {
        $user = $this->ctx->user();
        $this->ctx->setState('checkout_name', ['phone' => $user?->phone]);
        $this->send($this->tpl('ask_name').($user && $user->name && $user->name !== $user->phone ? "\n(برای استفاده از «".$user->name."» بنویسید: همان)" : ''), null, ['remove_keyboard' => true]);
    }

    /** Handle free text while in a checkout state. Returns true when consumed. */
    public function handleCheckoutText(string $text, array $message): bool
    {
        $state = $this->ctx->state();
        if ($text === 'انصراف' || $text === '/cancel') {
            $this->ctx->setState('', []);
            $this->send('ثبت سفارش لغو شد.', null, $this->mainMenu());

            return true;
        }
        switch ($state) {
            case 'checkout_contact':
                if (! empty($message['contact'])) {
                    if ($this->linkContact((array) $message['contact'])) {
                        $this->askName();
                    }
                } else {
                    $this->send($this->tpl('ask_contact'), null, $this->contactKeyboard());
                }

                return true;
            case 'checkout_name':
                $user = $this->ctx->user();
                $name = $text === 'همان' && $user ? (string) $user->name : trim($text);
                if (mb_strlen($name) < 3) {
                    $this->send($this->tpl('ask_name'));

                    return true;
                }
                $this->ctx->patchDraft(['name' => $name]);
                $this->askProvince();

                return true;
            case 'checkout_city':
                $this->ctx->patchDraft(['city' => trim($text)]);
                $this->ctx->setState('checkout_address');
                $this->send($this->tpl('ask_address'));

                return true;
            case 'checkout_address':
                if (! empty($message['location'])) {
                    $this->ctx->patchDraft([
                        'lat' => (float) data_get($message, 'location.latitude'),
                        'lng' => (float) data_get($message, 'location.longitude'),
                    ]);
                    $this->send('📍 موقعیت ثبت شد. حالا نشانی متنی (پلاک/واحد) را هم بنویسید:');

                    return true;
                }
                if (mb_strlen(trim($text)) < 10) {
                    $this->send('نشانی کوتاه است؛ لطفاً کامل‌تر بنویسید.');

                    return true;
                }
                $this->ctx->patchDraft(['address' => trim($text)]);
                $this->ctx->setState('checkout_postcode');
                $this->send($this->tpl('ask_postcode'));

                return true;
            case 'checkout_postcode':
                $pc = preg_replace('/\D+/', '', strtr($text, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']));
                if ($text !== 'ندارد' && strlen((string) $pc) !== 10) {
                    $this->send('کد پستی باید ۱۰ رقم باشد (یا بنویسید «ندارد»).');

                    return true;
                }
                $this->ctx->patchDraft(['postcode' => $text === 'ندارد' ? null : $pc]);
                $this->askShipping();

                return true;
            case 'checkout_c2c_receipt':
                $this->receiveReceipt($message);

                return true;
        }

        return false;
    }

    public function askProvince(): void
    {
        $this->ctx->setState('checkout_province');
        $rows = [];
        foreach (array_chunk(ShippingZonesService::IR_STATES, 3) as $chunk) {
            $rows[] = array_map(fn ($s) => ['text' => $s['name'], 'callback_data' => 'st:'.$s['code']], $chunk);
        }
        $this->send('استان را انتخاب کنید:', $rows);
    }

    public function pickProvince(string $code): void
    {
        $state = collect(ShippingZonesService::IR_STATES)->firstWhere('code', $code);
        if (! $state) {
            $this->askProvince();

            return;
        }
        $this->ctx->patchDraft(['state_code' => $code, 'state' => $state['name']]);
        $cities = app(ShippingZonesService::class)->citiesFor($this->ctx->tenantId(), $code);
        $this->ctx->setState('checkout_city');
        if ($cities !== []) {
            $rows = [];
            foreach (array_chunk($cities, 3) as $chunk) {
                $rows[] = array_map(fn ($c) => ['text' => $c, 'callback_data' => 'cy:'.mb_substr($c, 0, 40)], $chunk);
            }
            $this->send('شهر را انتخاب کنید (یا نام شهر را بنویسید):', $rows);

            return;
        }
        $this->send('نام شهر را بنویسید:');
    }

    public function pickCity(string $city): void
    {
        $this->ctx->patchDraft(['city' => $city]);
        $this->ctx->setState('checkout_address');
        $this->send($this->tpl('ask_address'));
    }

    public function askShipping(): void
    {
        $d = $this->ctx->draft();
        $sum = $this->cartSummary($this->cart());
        $zones = app(ShippingZonesService::class);
        $rates = $zones->quote($this->ctx->tenantId(), $d['state_code'] ?? null, $d['postcode'] ?? null, $sum['subtotal'], $d['city'] ?? null, $sum['lines']);
        if ($rates === []) {
            $this->ctx->patchDraft(['instance_id' => null]);
            $this->confirm();

            return;
        }
        $this->ctx->setState('checkout_shipping');
        $rows = array_map(fn ($r) => [['text' => $r['title'].' — '.($r['cost_minor'] > 0 ? self::money($r['cost_minor'], $sum['currency']) : 'رایگان'), 'callback_data' => 'sm:'.$r['instance_id']]], $rates);
        $this->send('روش ارسال را انتخاب کنید:', $rows);
    }

    public function pickShipping(int $instanceId): void
    {
        $this->ctx->patchDraft(['instance_id' => $instanceId]);
        $this->confirm();
    }

    public function confirm(): void
    {
        $d = $this->ctx->draft();
        $sum = $this->cartSummary($this->cart());
        $this->ctx->setState('checkout_confirm');
        $text = "📝 خلاصهٔ سفارش\n\nگیرنده: ".($d['name'] ?? '—')."\nموبایل: ".($d['phone'] ?? $this->ctx->user()?->phone ?? '—')
            ."\nنشانی: ".trim(($d['state'] ?? '').'، '.($d['city'] ?? '').'، '.($d['address'] ?? ''), '، ')
            ."\nکد پستی: ".($d['postcode'] ?? 'ندارد')
            ."\n\nجمع اقلام: ".self::money($sum['subtotal'], $sum['currency'])."\n(هزینهٔ ارسال و تخفیف در مرحلهٔ بعد محاسبه می‌شود)";
        $this->send($text, [[['text' => '✅ ثبت نهایی', 'callback_data' => 'cf']], [['text' => '✖️ انصراف', 'callback_data' => 'cn']]]);
    }

    public function placeOrder(): void
    {
        $user = $this->ctx->user();
        if (! $user) {
            $this->startCheckout();

            return;
        }
        $this->cart(); // ensure user cart has merged items
        $d = $this->ctx->draft();
        $payload = [
            'channel' => $this->ctx->provider(),
            'customer_phone' => $d['phone'] ?? $user->phone,
            'shipping_address' => array_filter([
                'name' => $d['name'] ?? null,
                'phone' => $d['phone'] ?? $user->phone,
                'state' => $d['state'] ?? null,
                'state_code' => $d['state_code'] ?? null,
                'city' => $d['city'] ?? null,
                'address' => $d['address'] ?? null,
                'postcode' => $d['postcode'] ?? null,
                'lat' => $d['lat'] ?? null,
                'lng' => $d['lng'] ?? null,
            ], fn ($v) => $v !== null && $v !== ''),
            'shipping_state_code' => $d['state_code'] ?? null,
            'shipping_postcode' => $d['postcode'] ?? null,
            'shipping_city' => $d['city'] ?? null,
        ];
        if (! empty($d['instance_id'])) {
            $payload['shipping_instance_id'] = (int) $d['instance_id'];
        }
        $req = Request::create('/api/v1/checkout', 'POST', array_filter($payload, fn ($v) => $v !== null));
        $req->setUserResolver(fn () => $user);
        try {
            $res = app(CheckoutController::class)->store($req);
        } catch (ValidationException $e) {
            $msg = collect($e->errors())->flatten()->first() ?: 'خطا در ثبت سفارش';
            $this->send('⚠️ ثبت سفارش ممکن نشد: '.self::faError((string) $msg));

            return;
        }
        $data = $res->getData(true);
        if ($res->getStatusCode() >= 400 || empty($data['data']['id'])) {
            $this->send('⚠️ ثبت سفارش ممکن نشد: '.self::faError((string) ($data['message'] ?? '')));

            return;
        }
        $order = Order::query()->find((int) $data['data']['id']);
        $meta = is_array($order->meta) ? $order->meta : [];
        $meta['bot'] = ['provider' => $this->ctx->provider(), 'chat_id' => $this->ctx->chatId];
        $order->update(['meta' => $meta, 'sales_channel' => $this->ctx->provider(), 'customer_name' => $d['name'] ?? $user->name]);
        $this->ctx->setState('', ['last_order_id' => $order->id]);
        $this->send($this->tpl('order_created', ['order_number' => $order->number ?: $order->id, 'total' => self::money((int) $order->total_minor, (string) $order->currency)]), null, $this->mainMenu());
        BotNotifier::newOrderToAdmins($order, $this->ctx);
        $this->paymentOptions($order);
    }

    public static function faError(string $msg): string
    {
        return match (true) {
            str_contains($msg, 'cart_not_for_sale') => 'برخی اقلام سبد دیگر قابل فروش نیستند.',
            str_contains($msg, 'weight') => 'وزن محصول برای محاسبهٔ ارسال ثبت نشده است.',
            str_contains($msg, 'Zero shipping') => 'روش ارسال انتخاب‌شده معتبر نیست.',
            str_contains($msg, 'stock') || str_contains($msg, 'Stock') => 'موجودی کافی نیست.',
            $msg === '' => 'خطای نامشخص',
            default => $msg,
        };
    }

    public function paymentOptions(Order $order): void
    {
        $tid = $this->ctx->tenantId();
        $gw = app(PaymentGatewaySettingsService::class);
        $labels = ['zarinpal' => 'زرین‌پال', 'zibal' => 'زیبال', 'digipay' => 'دیجی‌پی', 'snapppay' => 'اسنپ‌پی (اقساطی)', 'torobpay' => 'ترب‌پی (اقساطی)', 'bale_pay' => 'پرداخت بله'];
        $rows = [];
        foreach (self::ONLINE_GATEWAYS as $g) {
            if ($g === 'bale_pay' && $this->ctx->provider() !== 'bale') {
                continue;
            }
            if ($gw->isEnabled($tid, $g) && $gw->configured($tid, $g)) {
                $rows[] = [['text' => '💳 '.$labels[$g], 'callback_data' => 'pay:'.$order->id.':'.$g]];
            }
        }
        if ($this->ctx->addon('card_to_card') && $gw->isEnabled($tid, 'c2c')) {
            $rows[] = [['text' => '🏦 کارت‌به‌کارت', 'callback_data' => 'pay:'.$order->id.':c2c']];
        }
        if ($order->payment_url) {
            $rows[] = [['text' => '🌐 پرداخت در سایت', 'url' => $this->siteUrl().$order->payment_url]];
        }
        if ($rows === []) {
            $this->send('درگاه پرداختی برای ربات فعال نیست؛ همکاران ما برای پرداخت با شما تماس می‌گیرند.');

            return;
        }
        $this->send('روش پرداخت را انتخاب کنید:', $rows);
    }

    public function pay(int $orderId, string $provider): void
    {
        $order = $this->ownOrder($orderId);
        if (! $order || ! in_array((string) $order->status, ['pending_payment', 'awaiting_gateway', 'on_hold'], true)) {
            $this->send('این سفارش در انتظار پرداخت نیست.');

            return;
        }
        if ($provider === 'c2c') {
            $this->startCardToCard($order);

            return;
        }
        if (! in_array($provider, self::ONLINE_GATEWAYS, true)) {
            return;
        }
        try {
            $intent = app(PaymentCheckoutService::class)->createIntent($order, $provider);
        } catch (\Throwable $e) {
            report($e);
            $this->send('⚠️ اتصال به درگاه ممکن نشد. لطفاً روش دیگری را امتحان کنید.');

            return;
        }
        $url = (string) ($intent->redirect_url ?? '');
        if ($url === '') {
            $this->send('⚠️ لینک پرداخت ساخته نشد.');

            return;
        }
        $this->send('برای پرداخت '.self::money((int) $order->total_minor, (string) $order->currency).' روی دکمهٔ زیر بزنید. پس از پرداخت، تأیید همین‌جا ارسال می‌شود.', [[['text' => '💳 پرداخت آنلاین', 'url' => $url]]]);
    }

    private function startCardToCard(Order $order): void
    {
        $cfg = \App\Models\C2cSetting::query()->where('tenant_id', $this->ctx->tenantId())->value('payload') ?? [];
        $cfg = is_array($cfg) ? $cfg : (json_decode((string) $cfg, true) ?: []);
        $cards = array_values(array_filter((array) ($cfg['cards'] ?? []), fn ($c) => ! empty($c['number'] ?? $c['card_number'] ?? null)));
        if ($cards === []) {
            $this->send('اطلاعات کارت مقصد ثبت نشده است؛ لطفاً روش دیگری را انتخاب کنید.');

            return;
        }
        $lines = [];
        foreach ($cards as $c) {
            $lines[] = '💳 '.($c['number'] ?? $c['card_number']).(! empty($c['holder'] ?? $c['owner'] ?? null) ? ' — '.($c['holder'] ?? $c['owner']) : '').(! empty($c['bank']) ? ' ('.$c['bank'].')' : '');
        }
        $order->update(['payment_tender' => 'card_to_card', 'payment_provider' => 'card_to_card', 'c2c_status' => 'pending']);
        $this->ctx->setState('checkout_c2c_receipt', ['order_id' => $order->id]);
        $hours = (int) ($cfg['deadline_hours'] ?? 2);
        $this->send("مبلغ ".self::money((int) $order->total_minor, (string) $order->currency)." را به یکی از کارت‌های زیر واریز کنید:\n\n".implode("\n", $lines)
            ."\n\nسپس تصویر رسید یا شمارهٔ پیگیری را همین‌جا بفرستید.".($hours > 0 ? "\nمهلت: {$hours} ساعت" : '').(! empty($cfg['instructions']) ? "\n\n".$cfg['instructions'] : ''));
    }

    private function receiveReceipt(array $message): void
    {
        $order = $this->ownOrder((int) ($this->ctx->draft()['order_id'] ?? 0));
        if (! $order) {
            $this->ctx->setState('', []);

            return;
        }
        $photo = $message['photo'] ?? null;
        $fileId = is_array($photo) && $photo !== [] ? (string) (end($photo)['file_id'] ?? '') : (string) data_get($message, 'document.file_id', '');
        $ref = trim((string) ($message['text'] ?? $message['caption'] ?? ''));
        if ($fileId === '' && $ref === '') {
            $this->send('لطفاً تصویر رسید یا شمارهٔ پیگیری را بفرستید.');

            return;
        }
        $meta = is_array($order->meta) ? $order->meta : [];
        $meta['c2c_bot_receipt'] = ['file_id' => $fileId ?: null, 'ref' => $ref ?: null, 'at' => now()->toIso8601String(), 'provider' => $this->ctx->provider()];
        $order->update(['meta' => $meta, 'c2c_status' => 'pending', 'payment_ref' => $ref !== '' ? mb_substr($ref, 0, 120) : $order->payment_ref]);
        $this->ctx->setState('', []);
        $this->send('✅ رسید دریافت شد و پس از بررسی، نتیجه همین‌جا اعلام می‌شود.', null, $this->mainMenu());
        (new AdminFlow($this->ctx))->notifyC2c($order, $fileId, $ref);
    }

    // ---------- Account / orders ----------

    public function ownOrder(int $id): ?Order
    {
        if (! $this->ctx->session->user_id) {
            return null;
        }

        return Order::query()->where('tenant_id', $this->ctx->tenantId())->where('user_id', $this->ctx->session->user_id)->find($id);
    }

    public function orders(): void
    {
        if (! $this->ctx->session->user_id) {
            $this->ctx->setState('link_contact');
            $this->send($this->tpl('ask_contact'), null, $this->contactKeyboard());

            return;
        }
        $orders = Order::query()->where('tenant_id', $this->ctx->tenantId())->where('user_id', $this->ctx->session->user_id)->orderByDesc('id')->limit(8)->get();
        if ($orders->isEmpty()) {
            $this->send('هنوز سفارشی ثبت نکرده‌اید.');

            return;
        }
        $rows = $orders->map(fn ($o) => [['text' => '#'.($o->number ?: $o->id).' — '.OrderShippingStatuses::label((string) $o->status).' — '.self::money((int) $o->total_minor, (string) $o->currency), 'callback_data' => 'od:'.$o->id]])->all();
        $this->send('سفارش‌های اخیر شما:', $rows);
    }

    public function orderDetail(int $id): void
    {
        $o = $this->ownOrder($id);
        if (! $o) {
            $this->send('سفارش پیدا نشد.');

            return;
        }
        $o->loadMissing('items');
        $text = 'سفارش #'.($o->number ?: $o->id)."\nوضعیت: ".OrderShippingStatuses::label((string) $o->status)
            ."\nتاریخ: ".self::jdate($o->created_at)."\n";
        foreach ($o->items as $it) {
            $text .= "\n• ".($it->product_name ?? $it->product?->name ?? '—').' × '.$it->quantity;
        }
        $text .= "\n\nمبلغ کل: ".self::money((int) $o->total_minor, (string) $o->currency);
        $tracking = (string) ($o->meta['tracking_code'] ?? $o->meta['tapin']['barcode'] ?? '');
        if ($tracking !== '') {
            $text .= "\nکد رهگیری: ".$tracking;
        }
        $kb = [];
        if (in_array((string) $o->status, ['pending_payment', 'awaiting_gateway'], true)) {
            $kb[] = [['text' => '💳 پرداخت', 'callback_data' => 'po:'.$o->id]];
        }
        $this->send($text, $kb ?: null);
    }

    public static function jdate($at): string
    {
        if (! $at) {
            return '—';
        }
        $c = \Illuminate\Support\Carbon::parse($at)->timezone('Asia/Tehran');
        [$y, $m, $d] = \App\Services\Orders\OrderDocumentRenderer::toJalali((int) $c->year, (int) $c->month, (int) $c->day);

        return sprintf('%04d/%02d/%02d %s', $y, $m, $d, $c->format('H:i'));
    }

    public function account(): void
    {
        $user = $this->ctx->user();
        if (! $user) {
            $this->ctx->setState('link_contact');
            $this->send("حساب شما هنوز به ربات متصل نیست.\n".$this->tpl('ask_contact'), null, $this->contactKeyboard());

            return;
        }
        $count = Order::query()->where('tenant_id', $this->ctx->tenantId())->where('user_id', $user->id)->count();
        $text = "👤 حساب کاربری\n\nنام: ".$user->name."\nموبایل: ".($user->phone ?: 'ندارد')."\nتعداد سفارش‌ها: ".$count;
        if ($this->ctx->addon('loyalty')) {
            $text .= "\nامتیاز باشگاه: ".(int) $user->loyalty_points;
        }
        $this->send($text, [[['text' => '🔌 قطع اتصال حساب', 'callback_data' => 'unlink']]]);
    }

    public function unlink(): void
    {
        $this->ctx->session->user_id = null;
        $this->ctx->session->save();
        $this->send('اتصال حساب از این ربات قطع شد.', null, $this->mainMenu());
    }
}
