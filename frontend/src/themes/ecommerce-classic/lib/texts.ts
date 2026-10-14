"use client"

/* Editable storefront copy for the classic shop theme.
 * Each entry is editable in Theme Settings → «متن‌ها» and stored under appearance.texts[group][key].
 * Defaults equal the previous hardcoded copy so nothing changes until the admin edits it.
 * Keep in sync with StorefrontAppearanceService::defaults()["texts"]. */

import { useCallback } from "react"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

export type ClassicTextEntry = { group: string; key: string; fa: string; labelFa: string; labelEn: string }

export const CLASSIC_TEXT_GROUPS: { id: string; labelFa: string; labelEn: string }[] = [
  { id: "header", labelFa: "هدر و منو", labelEn: "Header & menu" },
  { id: "home", labelFa: "صفحه اصلی", labelEn: "Home" },
  { id: "product", labelFa: "صفحه محصول", labelEn: "Product page" },
  { id: "card", labelFa: "کارت محصول", labelEn: "Product card" },
  { id: "cart", labelFa: "سبد خرید", labelEn: "Cart" },
  { id: "checkout", labelFa: "تسویه حساب", labelEn: "Checkout" },
  { id: "pages", labelFa: "صفحات (۴۰۴، پیگیری، ورود، علاقه‌مندی)", labelEn: "Pages (404, tracking, login, wishlist)" },
  { id: "archive", labelFa: "آرشیو و فیلترها", labelEn: "Archive & filters" },
  { id: "blog", labelFa: "وبلاگ", labelEn: "Blog" },
  { id: "footer", labelFa: "فوتر", labelEn: "Footer" },
]

export const CLASSIC_TEXTS: ClassicTextEntry[] = [
  { group: "header", key: "mega_empty", fa: "هنوز دسته‌بندی ثبت نشده است.", labelFa: "پیام نبود دسته‌بندی", labelEn: "No categories message" },
  { group: "header", key: "mega_no_children", fa: "زیردسته‌ای برای این گروه ثبت نشده است.", labelFa: "پیام نبود زیردسته", labelEn: "No subcategories message" },
  { group: "header", key: "mega_all_prefix", fa: "همه محصولات", labelFa: "پیشوند «همه محصولات»", labelEn: "All products prefix" },
  { group: "header", key: "loading", fa: "در حال بارگذاری…", labelFa: "متن در حال بارگذاری", labelEn: "Loading text" },
  { group: "header", key: "minicart_empty", fa: "هیچ محصولی در سبد خرید نیست.", labelFa: "سبد کوچک خالی", labelEn: "Mini cart empty" },
  { group: "header", key: "minicart_remove", fa: "حذف", labelFa: "دکمه حذف", labelEn: "Remove button" },
  { group: "header", key: "minicart_subtotal", fa: "جمع جزء", labelFa: "عنوان جمع جزء", labelEn: "Subtotal label" },
  { group: "header", key: "minicart_view", fa: "مشاهده سبد", labelFa: "دکمه مشاهده سبد", labelEn: "View cart button" },
  { group: "header", key: "minicart_checkout", fa: "تسویه حساب", labelFa: "دکمه تسویه حساب", labelEn: "Checkout button" },
  { group: "header", key: "cart_label", fa: "سبد خرید", labelFa: "عنوان دکمه سبد", labelEn: "Cart button label" },
  { group: "header", key: "account_login", fa: "ورود و عضویت", labelFa: "ورود و عضویت (منوی حساب)", labelEn: "Login / register" },
  { group: "header", key: "account_tracking", fa: "پیگیری سفارش", labelFa: "پیگیری سفارش (منوی حساب)", labelEn: "Order tracking" },
  { group: "header", key: "account_orders", fa: "سفارش‌ها", labelFa: "سفارش‌ها (منوی حساب)", labelEn: "Orders" },
  { group: "header", key: "account_wishlist", fa: "علاقه‌مندی", labelFa: "علاقه‌مندی (منوی حساب)", labelEn: "Wishlist" },
  { group: "header", key: "account_addresses", fa: "آدرس‌ها", labelFa: "آدرس‌ها (منوی حساب)", labelEn: "Addresses" },
  { group: "header", key: "account_profile", fa: "پروفایل", labelFa: "پروفایل (منوی حساب)", labelEn: "Profile" },
  { group: "header", key: "account_logout", fa: "خروج", labelFa: "خروج (منوی حساب)", labelEn: "Logout" },
  { group: "header", key: "search_popular_title", fa: "جستجوهای پرتکرار", labelFa: "عنوان جستجوهای پرتکرار", labelEn: "Popular searches title" },
  { group: "header", key: "search_recent_title", fa: "آخرین جستجوهای شما", labelFa: "عنوان جستجوهای اخیر", labelEn: "Recent searches title" },
  { group: "header", key: "search_none", fa: "موردی وجود ندارد", labelFa: "پیام نبود مورد", labelEn: "Nothing yet" },
  { group: "header", key: "search_no_result", fa: "نتیجه‌ای یافت نشد", labelFa: "پیام نبود نتیجه", labelEn: "No results" },
  { group: "header", key: "search_view_all", fa: "مشاهده همه نتایج", labelFa: "دکمه همه نتایج", labelEn: "View all results" },
  { group: "header", key: "drawer_categories", fa: "دسته بندی محصولات", labelFa: "عنوان دسته‌ها در منوی موبایل", labelEn: "Mobile drawer categories title" },
  { group: "home", key: "cta_view_products", fa: "مشاهده محصولات", labelFa: "دکمه پیش‌فرض اسلاید/بنر", labelEn: "Default slide/banner CTA" },
  { group: "home", key: "remaining_label", fa: "عدد باقی‌مانده", labelFa: "برچسب موجودی باقی‌مانده", labelEn: "Remaining stock label" },
  { group: "home", key: "taste_subtitle", fa: "بر اساس دسته‌های محبوب فروشگاه", labelFa: "زیرعنوان سلیقه‌ها", labelEn: "Taste box subtitle" },
  { group: "home", key: "more_label", fa: "بیشتر", labelFa: "برچسب «بیشتر»", labelEn: "More label" },
  { group: "home", key: "special_title", fa: "پیشنهادهای ویژه امروز", labelFa: "عنوان پیشنهادهای ویژه", labelEn: "Special offers title" },
  { group: "home", key: "best_sellers_title", fa: "پرفروش‌ترین محصولات", labelFa: "عنوان پرفروش‌ها", labelEn: "Best sellers title" },
  { group: "home", key: "amazing_title", fa: "پیشنهاد شگفت‌انگیز", labelFa: "عنوان شگفت‌انگیز", labelEn: "Amazing offers title" },
  { group: "home", key: "view_all", fa: "مشاهده همه", labelFa: "برچسب «مشاهده همه»", labelEn: "View all label" },
  { group: "home", key: "view_all_products", fa: "مشاهده همه محصولات", labelFa: "برچسب «مشاهده همه محصولات»", labelEn: "View all products label" },
  { group: "home", key: "brands_title", fa: "برندهای محبوب", labelFa: "عنوان برندها", labelEn: "Brands title" },
  { group: "home", key: "items_suffix", fa: "کالا", labelFa: "پسوند تعداد کالا", labelEn: "Items count suffix" },
  { group: "home", key: "blog_title", fa: "مجله", labelFa: "عنوان بلوک مجله", labelEn: "Blog block title" },
  { group: "home", key: "blog_view_all", fa: "مشاهده همه مقالات", labelFa: "دکمه همه مقالات", labelEn: "View all posts" },
  { group: "home", key: "recent_title", fa: "بازدیدهای اخیر شما", labelFa: "عنوان بازدیدهای اخیر", labelEn: "Recently viewed title" },
  { group: "home", key: "taste_title", fa: "پیشنهاد برای سلیقه شما", labelFa: "عنوان سلیقه‌ها", labelEn: "Taste box title" },
  { group: "home", key: "story_view_product", fa: "مشاهده محصول", labelFa: "دکمه مشاهده محصول (استوری)", labelEn: "Story product button" },
  { group: "home", key: "badge_sale", fa: "تخفیف", labelFa: "برچسب تخفیف", labelEn: "Sale badge" },
  { group: "home", key: "badge_new", fa: "جدید", labelFa: "برچسب جدید", labelEn: "New badge" },
  { group: "product", key: "not_found", fa: "محصولی پیدا نشد.", labelFa: "محصول پیدا نشد", labelEn: "Product not found" },
  { group: "product", key: "new_badge", fa: "جدید", labelFa: "برچسب جدید", labelEn: "New badge" },
  { group: "product", key: "rating_label", fa: "امتیاز و دیدگاه", labelFa: "برچسب امتیاز", labelEn: "Rating label" },
  { group: "product", key: "stats_label", fa: "نمایش تشویقی", labelFa: "برچسب آمار تشویقی", labelEn: "Promotional stats label" },
  { group: "product", key: "select_model", fa: "انتخاب مدل", labelFa: "عنوان انتخاب مدل", labelEn: "Choose variant title" },
  { group: "product", key: "features_title", fa: "مشاهده ویژگی‌های محصول", labelFa: "عنوان ویژگی‌ها", labelEn: "Features title" },
  { group: "product", key: "desc_open", fa: "مشاهده توضیحات محصول", labelFa: "دکمه باز کردن توضیحات", labelEn: "Show description" },
  { group: "product", key: "desc_close", fa: "بستن توضیحات", labelFa: "دکمه بستن توضیحات", labelEn: "Hide description" },
  { group: "product", key: "return_notice", fa: "امکان برگشت کالا در گروه آرایشی و بهداشتی با دلیل «انصراف از خرید» تنها در صورتی مورد قبول است که پلمب کالا باز نشده باشد.", labelFa: "متن اطلاعیه بازگشت کالا (خالی = مخفی)", labelEn: "Return notice (empty = hidden)" },
  { group: "product", key: "guarantee_text", fa: "۷ روز ضمانت بازگشت بی قید و شرط", labelFa: "متن ضمانت کنار خرید (خالی = مخفی)", labelEn: "Guarantee line (empty = hidden)" },
  { group: "product", key: "in_stock", fa: "موجود در انبار", labelFa: "متن موجود", labelEn: "In stock" },
  { group: "product", key: "out_of_stock", fa: "ناموجود", labelFa: "متن ناموجود", labelEn: "Out of stock" },
  { group: "product", key: "tab_desc", fa: "توضیحات", labelFa: "تب توضیحات", labelEn: "Description tab" },
  { group: "product", key: "tab_spec", fa: "توضیحات تکمیلی", labelFa: "تب مشخصات", labelEn: "Specifications tab" },
  { group: "product", key: "tab_faq", fa: "پرسش‌ها", labelFa: "تب پرسش‌ها", labelEn: "Questions tab" },
  { group: "product", key: "tab_reviews", fa: "نظرات", labelFa: "تب نظرات", labelEn: "Reviews tab" },
  { group: "product", key: "faq_empty", fa: "هنوز پرسشی ثبت نشده است.", labelFa: "پیام نبود پرسش", labelEn: "No questions yet" },
  { group: "product", key: "reviews_title", fa: "نقد و بررسی", labelFa: "عنوان نقد و بررسی", labelEn: "Reviews title" },
  { group: "product", key: "installment_guide", fa: "راهنمای خرید اقساطی", labelFa: "لینک راهنمای اقساط", labelEn: "Installment guide link" },
  { group: "product", key: "add_to_cart", fa: "افزودن به سبد خرید", labelFa: "دکمه افزودن به سبد", labelEn: "Add to cart button" },
  { group: "card", key: "new_badge", fa: "جدید", labelFa: "برچسب جدید کارت", labelEn: "Card new badge" },
  { group: "card", key: "out_of_stock", fa: "ناموجود", labelFa: "برچسب ناموجود کارت", labelEn: "Card out of stock" },
  { group: "card", key: "in_stock", fa: "موجود در انبار", labelFa: "برچسب موجود کارت", labelEn: "Card in stock" },
  { group: "card", key: "view_product", fa: "مشاهده محصول", labelFa: "دکمه مشاهده محصول", labelEn: "View product button" },
  { group: "cart", key: "back_title", fa: "بازگشت به فروشگاه", labelFa: "عنوان بازگشت", labelEn: "Back title" },
  { group: "cart", key: "back_subtitle", fa: "شما داخل سبد خرید هستید", labelFa: "زیرعنوان بازگشت", labelEn: "Back subtitle" },
  { group: "cart", key: "free_ship_title", fa: "ارسال رایگان برای سفارشات", labelFa: "عنوان نوار ارسال رایگان", labelEn: "Free shipping title" },
  { group: "cart", key: "free_ship_done", fa: "تبریک! ارسال این سفارش رایگان است.", labelFa: "پیام ارسال رایگان فعال شد", labelEn: "Free shipping reached" },
  { group: "cart", key: "empty_flash", fa: "سبد خرید شما در حال حاضر خالی است.", labelFa: "پیام بالای سبد خالی", labelEn: "Empty cart flash" },
  { group: "cart", key: "empty_title", fa: "سبد خرید شما خالیست", labelFa: "عنوان سبد خالی", labelEn: "Empty cart title" },
  { group: "cart", key: "empty_text", fa: "می‌توانید برای مشاهده محصولات بیشتر به صفحات زیر بروید", labelFa: "متن سبد خالی", labelEn: "Empty cart text" },
  { group: "cart", key: "guest_note", fa: "برای ثبت نهایی سفارش وارد حساب کاربری شوید؛ سبد شما حفظ می‌شود.", labelFa: "پیام مهمان", labelEn: "Guest note" },
  { group: "cart", key: "clear", fa: "خالی کردن سبد", labelFa: "دکمه خالی کردن", labelEn: "Clear cart" },
  { group: "cart", key: "coupon_placeholder", fa: "کد تخفیف را وارد نمایید", labelFa: "placeholder کد تخفیف", labelEn: "Coupon placeholder" },
  { group: "cart", key: "coupon_apply", fa: "اعمال کد تخفیف", labelFa: "دکمه اعمال کد", labelEn: "Apply coupon" },
  { group: "cart", key: "coupon_empty", fa: "کد تخفیف را وارد کنید.", labelFa: "پیام کد خالی", labelEn: "Coupon empty" },
  { group: "cart", key: "coupon_applied", fa: "کد تخفیف اعمال شد.", labelFa: "پیام کد اعمال شد", labelEn: "Coupon applied" },
  { group: "cart", key: "coupon_invalid", fa: "کد تخفیف معتبر نیست.", labelFa: "پیام کد نامعتبر", labelEn: "Coupon invalid" },
  { group: "cart", key: "discount_label", fa: "تخفیف", labelFa: "برچسب تخفیف", labelEn: "Discount label" },
  { group: "cart", key: "total_label", fa: "جمع سبد خرید", labelFa: "برچسب جمع سبد", labelEn: "Cart total" },
  { group: "cart", key: "login_card_title", fa: "ورود به حساب کاربری", labelFa: "عنوان کارت ورود", labelEn: "Login card title" },
  { group: "cart", key: "login_card_text", fa: "جهت مشاهده محصولاتی که پیش‌تر به سبد خرید خود اضافه کرده‌اید وارد شوید.", labelFa: "متن کارت ورود", labelEn: "Login card text" },
  { group: "cart", key: "deals_card_title", fa: "پیشنهاد شگفت‌انگیز", labelFa: "عنوان کارت شگفت‌انگیز", labelEn: "Deals card title" },
  { group: "checkout", key: "login_title", fa: "ورود برای ادامه خرید", labelFa: "عنوان ورود مهمان", labelEn: "Guest login title" },
  { group: "checkout", key: "login_text", fa: "برای ثبت سفارش و پرداخت، وارد حساب کاربری شوید. سبد خرید شما حفظ می‌شود.", labelFa: "متن ورود مهمان", labelEn: "Guest login text" },
  { group: "checkout", key: "login_button", fa: "ورود و ادامه خرید", labelFa: "دکمه ورود", labelEn: "Login button" },
  { group: "checkout", key: "address_title", fa: "اطلاعات تحویل‌گیرنده و آدرس", labelFa: "عنوان بخش آدرس", labelEn: "Address section title" },
  { group: "checkout", key: "recipient_label", fa: "نام و نام خانوادگی تحویل‌گیرنده", labelFa: "برچسب نام تحویل‌گیرنده", labelEn: "Recipient name label" },
  { group: "checkout", key: "state_label", fa: "استان", labelFa: "برچسب استان", labelEn: "State label" },
  { group: "checkout", key: "select_placeholder", fa: "انتخاب کنید", labelFa: "گزینه پیش‌فرض انتخاب", labelEn: "Select placeholder" },
  { group: "checkout", key: "city_label", fa: "شهر", labelFa: "برچسب شهر", labelEn: "City label" },
  { group: "checkout", key: "postcode_label", fa: "کد پستی", labelFa: "برچسب کد پستی", labelEn: "Postcode label" },
  { group: "checkout", key: "phone_label", fa: "موبایل", labelFa: "برچسب موبایل", labelEn: "Mobile label" },
  { group: "checkout", key: "address_label", fa: "آدرس کامل", labelFa: "برچسب آدرس", labelEn: "Address label" },
  { group: "checkout", key: "coupon_label", fa: "کد تخفیف", labelFa: "برچسب کد تخفیف", labelEn: "Coupon label" },
  { group: "checkout", key: "note_label", fa: "یادداشت سفارش", labelFa: "برچسب یادداشت", labelEn: "Order note label" },
  { group: "checkout", key: "shipping_title", fa: "هزینه ارسال", labelFa: "عنوان هزینه ارسال", labelEn: "Shipping title" },
  { group: "checkout", key: "shipping_quote", fa: "محاسبه هزینه ارسال", labelFa: "دکمه محاسبه ارسال", labelEn: "Quote shipping" },
  { group: "checkout", key: "shipping_hint", fa: "پس از وارد کردن استان و کد پستی، هزینه را محاسبه کنید.", labelFa: "راهنمای ارسال", labelEn: "Shipping hint" },
  { group: "checkout", key: "payment_title", fa: "روش پرداخت", labelFa: "عنوان روش پرداخت", labelEn: "Payment title" },
  { group: "checkout", key: "cash_tab", fa: "پرداخت نقدی", labelFa: "تب نقدی", labelEn: "Cash tab" },
  { group: "checkout", key: "installment_tab", fa: "پرداخت اقساطی", labelFa: "تب اقساطی", labelEn: "Installment tab" },
  { group: "checkout", key: "gateway_ready", fa: "آماده پرداخت امن", labelFa: "توضیح درگاه فعال", labelEn: "Gateway ready" },
  { group: "checkout", key: "back_to_edit", fa: "بازگشت به ویرایش اطلاعات", labelFa: "دکمه بازگشت", labelEn: "Back to edit" },
  { group: "checkout", key: "summary_title", fa: "خلاصه سفارش", labelFa: "عنوان خلاصه سفارش", labelEn: "Summary title" },
  { group: "checkout", key: "summary_empty", fa: "سبد خرید خالی است.", labelFa: "پیام سبد خالی", labelEn: "Empty summary" },
  { group: "checkout", key: "payable_label", fa: "مبلغ قابل پرداخت", labelFa: "برچسب مبلغ قابل پرداخت", labelEn: "Payable" },
  { group: "checkout", key: "assurance_1", fa: "ضمانت بازگشت کالا", labelFa: "تضمین ۱", labelEn: "Assurance 1" },
  { group: "checkout", key: "assurance_2", fa: "ارسال سریع", labelFa: "تضمین ۲", labelEn: "Assurance 2" },
  { group: "checkout", key: "assurance_3", fa: "پرداخت امن", labelFa: "تضمین ۳", labelEn: "Assurance 3" },
  { group: "pages", key: "nf_title", fa: "این صفحه پیدا نشد", labelFa: "عنوان ۴۰۴", labelEn: "404 title" },
  { group: "pages", key: "nf_text", fa: "نشانی را دوباره بررسی کنید یا به فروشگاه برگردید.", labelFa: "متن ۴۰۴", labelEn: "404 text" },
  { group: "pages", key: "nf_home", fa: "بازگشت به خانه", labelFa: "دکمه خانه ۴۰۴", labelEn: "404 home button" },
  { group: "pages", key: "nf_shop", fa: "مشاهده فروشگاه", labelFa: "دکمه فروشگاه ۴۰۴", labelEn: "404 shop button" },
  { group: "pages", key: "track_title", fa: "پیگیری سفارش", labelFa: "عنوان پیگیری سفارش", labelEn: "Tracking title" },
  { group: "pages", key: "track_text", fa: "شماره سفارش و موبایل یا ایمیل ثبت‌شده را وارد کنید.", labelFa: "توضیح پیگیری", labelEn: "Tracking description" },
  { group: "pages", key: "track_number", fa: "شماره سفارش", labelFa: "برچسب شماره سفارش", labelEn: "Order number label" },
  { group: "pages", key: "track_contact", fa: "موبایل یا ایمیل", labelFa: "برچسب موبایل/ایمیل", labelEn: "Mobile or email label" },
  { group: "pages", key: "track_submit", fa: "پیگیری", labelFa: "دکمه پیگیری", labelEn: "Track button" },
  { group: "pages", key: "track_not_found", fa: "سفارشی با این مشخصات پیدا نشد.", labelFa: "پیام پیدا نشدن سفارش", labelEn: "Order not found" },
  { group: "pages", key: "wishlist_title", fa: "علاقه‌مندی‌ها", labelFa: "عنوان علاقه‌مندی", labelEn: "Wishlist title" },
  { group: "pages", key: "wishlist_empty", fa: "هنوز محصولی به علاقه‌مندی‌ها اضافه نکرده‌اید.", labelFa: "پیام علاقه‌مندی خالی", labelEn: "Wishlist empty" },
  { group: "pages", key: "login_title", fa: "ورود یا ثبت‌نام", labelFa: "عنوان صفحه ورود", labelEn: "Login title" },
  { group: "pages", key: "login_text", fa: "برای ورود یا ثبت‌نام، شماره موبایل خود را وارد کنید.", labelFa: "متن صفحه ورود", labelEn: "Login text" },
  { group: "archive", key: "sort_label", fa: "مرتب‌سازی:", labelFa: "برچسب مرتب‌سازی", labelEn: "Sort label" },
  { group: "archive", key: "empty_title", fa: "محصولی با این مشخصات پیدا نشد", labelFa: "عنوان آرشیو خالی", labelEn: "Empty archive title" },
  { group: "archive", key: "empty_text", fa: "فیلترها را تغییر دهید یا همه محصولات را ببینید.", labelFa: "متن آرشیو خالی", labelEn: "Empty archive text" },
  { group: "archive", key: "view_all", fa: "مشاهده همه محصولات", labelFa: "دکمه همه محصولات", labelEn: "View all products" },
  { group: "archive", key: "filters_title", fa: "فیلترها", labelFa: "عنوان فیلترها", labelEn: "Filters title" },
  { group: "archive", key: "clear_filters", fa: "حذف فیلترها", labelFa: "دکمه حذف فیلترها", labelEn: "Clear filters" },
  { group: "archive", key: "in_stock_only", fa: "فقط کالاهای موجود", labelFa: "فیلتر موجود", labelEn: "In-stock filter" },
  { group: "archive", key: "on_sale_only", fa: "فقط کالاهای تخفیف‌دار", labelFa: "فیلتر تخفیف‌دار", labelEn: "On-sale filter" },
  { group: "blog", key: "read_more", fa: "ادامه مطلب", labelFa: "دکمه ادامه مطلب", labelEn: "Read more" },
  { group: "blog", key: "related", fa: "مطالب مرتبط", labelFa: "عنوان مطالب مرتبط", labelEn: "Related posts" },
  { group: "blog", key: "toc", fa: "فهرست مطالب", labelFa: "عنوان فهرست مطالب", labelEn: "Table of contents" },
  { group: "blog", key: "most_viewed", fa: "پربازدیدترین", labelFa: "عنوان پربازدیدترین", labelEn: "Most viewed" },
  { group: "footer", key: "back_to_top", fa: "برگشت به بالا", labelFa: "دکمه برگشت به بالا", labelEn: "Back to top" },
]

const DEFAULTS: Record<string, string> = Object.fromEntries(CLASSIC_TEXTS.map((e) => [`${e.group}.${e.key}`, e.fa]))

/** Read a stored override (appearance.texts[group][key]) or the built-in default. A single "-" hides the text. */
export function classicText(texts: unknown, id: string, vars?: Record<string, string>): string {
  const [group, key] = id.split(".", 2)
  let value = DEFAULTS[id] ?? ""
  if (texts && typeof texts === "object") {
    const section = (texts as Record<string, unknown>)[group]
    if (section && typeof section === "object") {
      const raw = (section as Record<string, unknown>)[key]
      if (typeof raw === "string" && raw.trim() !== "") value = raw.trim() === "-" ? "" : raw
    }
  }
  if (vars) {
    for (const [name, v] of Object.entries(vars)) value = value.split(`{${name}}`).join(v)
  }
  return value
}

/** Hook form: `const tx = useClassicText(); tx("cart.empty_title")`. */
export function useClassicText(): (id: string, vars?: Record<string, string>) => string {
  const theme = useClassicThemeSettings()
  const texts = theme.texts
  return useCallback((id: string, vars?: Record<string, string>) => classicText(texts, id, vars), [texts])
}
