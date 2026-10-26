# Page-builder widget catalog

Source of truth: `frontend/src/builder/widget-catalog.ts` (shape: `categories[]` + `widgetKey -> { category, icon }`). ERP mirrors this in `@webina/ui`. Icons are lucide-react component names. Widget keys and props are unchanged.

## Categories

| id | fa | en | icon |
|---|---|---|---|
| `layout` | چیدمان | Layout | `LayoutTemplate` |
| `basic` | متن و پایه | Text & basics | `Type` |
| `media` | تصویر و رسانه | Media | `Image` |
| `interactive` | تعاملی | Interactive | `MousePointerClick` |
| `marketing` | بازاریابی و لندینگ | Marketing | `Megaphone` |
| `forms` | فرم و تماس | Forms & contact | `ClipboardList` |
| `chrome` | هدر و فوتر | Header & footer | `PanelTop` |
| `shop` | فروشگاه و آرشیو | Shop & archive | `Store` |
| `product` | صفحه محصول | Product page | `Package` |
| `checkout` | سبد، تسویه و حساب | Cart, checkout & account | `CreditCard` |
| `blog` | وبلاگ و مجله | Blog & magazine | `Newspaper` |
| `resume` | رزومه | Resume | `IdCard` |
| `poetry` | شعر و ادبی | Poetry & literary | `Feather` |
| `cafe` | کافه | Cafe | `Coffee` |
| `other` | سایر | Other | `Blocks` |

`resume-*` keys (resume module, in progress) fall into `resume` with `FileUser` until listed; unknown keys go to `other`.

## Widgets

| key | category | icon |
|---|---|---|
| `section` | `layout` | `Rows3` |
| `container` | `layout` | `Square` |
| `columns` | `layout` | `Columns3` |
| `flex-container` | `layout` | `AlignHorizontalSpaceAround` |
| `grid-container` | `layout` | `Grid3x3` |
| `spacer` | `layout` | `MoveVertical` |
| `divider` | `layout` | `SeparatorHorizontal` |
| `off-canvas` | `layout` | `PanelRightOpen` |
| `heading` | `basic` | `Heading` |
| `text` | `basic` | `Pilcrow` |
| `button` | `basic` | `MousePointerClick` |
| `icon` | `basic` | `Sparkle` |
| `icon-list` | `basic` | `ListChecks` |
| `icon-box` | `basic` | `SquareStar` |
| `html` | `basic` | `CodeXml` |
| `section-heading` | `basic` | `Heading2` |
| `quote-block` | `basic` | `Quote` |
| `image` | `media` | `Image` |
| `image-box` | `media` | `ImagePlay` |
| `image-gallery` | `media` | `Images` |
| `image-carousel` | `media` | `GalleryHorizontalEnd` |
| `video` | `media` | `Video` |
| `video-embed` | `media` | `TvMinimalPlay` |
| `audio-block` | `media` | `AudioLines` |
| `before-after` | `media` | `SplitSquareHorizontal` |
| `lottie` | `media` | `Clapperboard` |
| `hotspot` | `media` | `LocateFixed` |
| `map` | `media` | `MapPinned` |
| `feed` | `media` | `Camera` |
| `tabs` | `interactive` | `PanelsTopLeft` |
| `accordion` | `interactive` | `ListCollapse` |
| `flip-box` | `interactive` | `FlipHorizontal2` |
| `state-box` | `interactive` | `ToggleRight` |
| `counter` | `interactive` | `Hash` |
| `countdown` | `interactive` | `Timer` |
| `popup` | `interactive` | `AppWindow` |
| `toc` | `interactive` | `TableOfContents` |
| `steps` | `interactive` | `Footprints` |
| `comparison-table` | `interactive` | `Table2` |
| `hero-slider` | `marketing` | `GalleryThumbnails` |
| `cta-banner` | `marketing` | `Megaphone` |
| `promo-banner` | `marketing` | `BadgePercent` |
| `promo-trio` | `marketing` | `LayoutPanelTop` |
| `special-banners` | `marketing` | `Star` |
| `banner-grid` | `marketing` | `LayoutDashboard` |
| `announcement-bar` | `marketing` | `BellRing` |
| `deal-bar` | `marketing` | `Zap` |
| `pricing-table` | `marketing` | `Receipt` |
| `testimonials` | `marketing` | `MessageSquareQuote` |
| `badges` | `marketing` | `Award` |
| `trust-badges` | `marketing` | `ShieldCheck` |
| `icon-cards` | `marketing` | `LayoutGrid` |
| `team-grid` | `marketing` | `Users` |
| `brand-row` | `marketing` | `Tags` |
| `brand-slider` | `marketing` | `GalleryVerticalEnd` |
| `story-strip` | `marketing` | `CircleDashed` |
| `social-icons` | `marketing` | `Share2` |
| `share-buttons` | `marketing` | `Forward` |
| `form` | `forms` | `ClipboardList` |
| `newsletter` | `forms` | `MailPlus` |
| `login-form` | `forms` | `LogIn` |
| `register-form` | `forms` | `UserPlus` |
| `login-cta` | `forms` | `KeyRound` |
| `search-box` | `forms` | `Search` |
| `site-header` | `chrome` | `PanelTop` |
| `site-footer` | `chrome` | `PanelBottom` |
| `store-header` | `chrome` | `AppWindowMac` |
| `store-footer` | `chrome` | `PanelBottomDashed` |
| `menu` | `chrome` | `Menu` |
| `nav-menu` | `chrome` | `Navigation` |
| `nav-dropdown` | `chrome` | `ListTree` |
| `mega-menu` | `chrome` | `LayoutList` |
| `menu-cart` | `chrome` | `ShoppingBasket` |
| `site-logo` | `chrome` | `Hexagon` |
| `cart-button` | `chrome` | `ShoppingCart` |
| `account-button` | `chrome` | `CircleUserRound` |
| `wishlist-button` | `chrome` | `Heart` |
| `phone-link` | `chrome` | `Phone` |
| `footer-links` | `chrome` | `Link` |
| `contact-info` | `chrome` | `Contact` |
| `trust-seals` | `chrome` | `BadgeCheck` |
| `copyright` | `chrome` | `Copyright` |
| `breadcrumbs` | `chrome` | `ChevronsLeft` |
| `product-grid` | `shop` | `Grid2x2` |
| `product-card` | `shop` | `PackageOpen` |
| `product-carousel` | `shop` | `ArrowLeftRight` |
| `loop-grid` | `shop` | `Repeat` |
| `category-grid` | `shop` | `FolderTree` |
| `category-tiles` | `shop` | `Shapes` |
| `category-list` | `shop` | `List` |
| `best-sellers` | `shop` | `Trophy` |
| `most-viewed` | `shop` | `Eye` |
| `recently-viewed` | `shop` | `History` |
| `amazing-offers` | `shop` | `Flame` |
| `amazing-header` | `shop` | `Rocket` |
| `taste-box` | `shop` | `Palette` |
| `package-block` | `shop` | `Boxes` |
| `customer-guide` | `shop` | `LifeBuoy` |
| `installment-info` | `shop` | `CalendarClock` |
| `filter-panel` | `shop` | `SlidersHorizontal` |
| `price-filter` | `shop` | `DollarSign` |
| `loop-filter` | `shop` | `Filter` |
| `archive-filters` | `shop` | `ListFilter` |
| `archive-title` | `shop` | `Heading1` |
| `archive-description` | `shop` | `AlignRight` |
| `archive-sort` | `shop` | `ArrowDownUp` |
| `archive-count` | `shop` | `ListOrdered` |
| `archive-subcategories` | `shop` | `FolderOpen` |
| `classic-compare` | `shop` | `Scale` |
| `classic-wishlist` | `shop` | `HeartHandshake` |
| `classic-not-found` | `shop` | `FileQuestion` |
| `product-detail` | `product` | `Package` |
| `product-title` | `product` | `Type` |
| `product-price` | `product` | `Banknote` |
| `product-rating` | `product` | `StarHalf` |
| `product-stock` | `product` | `Warehouse` |
| `product-attributes` | `product` | `ListTodo` |
| `product-description` | `product` | `FileText` |
| `product-faq` | `product` | `CircleHelp` |
| `product-gallery` | `product` | `GalleryHorizontal` |
| `add-to-cart-box` | `product` | `ShoppingBag` |
| `product-reviews` | `product` | `MessageSquareText` |
| `product-questions` | `product` | `MessagesSquare` |
| `related-products` | `product` | `Network` |
| `linked-products` | `product` | `Link2` |
| `cart-lines` | `checkout` | `Store` |
| `cart-totals` | `checkout` | `Calculator` |
| `cart-coupon` | `checkout` | `TicketPercent` |
| `free-shipping-bar` | `checkout` | `Truck` |
| `checkout` | `checkout` | `CreditCard` |
| `purchase-summary` | `checkout` | `ReceiptText` |
| `classic-order-track` | `checkout` | `PackageSearch` |
| `account` | `checkout` | `UserRound` |
| `account-dashboard` | `checkout` | `Gauge` |
| `blog-posts` | `blog` | `Newspaper` |
| `blog-teasers` | `blog` | `BookOpen` |
| `blog-slider` | `blog` | `BookImage` |
| `blog-toc` | `blog` | `BookA` |
| `post-title` | `blog` | `Heading3` |
| `post-cover` | `blog` | `ImageUp` |
| `post-meta` | `blog` | `CalendarDays` |
| `post-content` | `blog` | `FileType` |
| `poetry-hero` | `poetry` | `Feather` |
| `poetry-page-hero` | `poetry` | `ScrollText` |
| `poetry-nav` | `poetry` | `PillBottle` |
| `poem-list` | `poetry` | `ListMusic` |
| `poem-archive` | `poetry` | `Library` |
| `poem-search` | `poetry` | `SearchCheck` |
| `poem-detail` | `poetry` | `BookOpenText` |
| `poem-single` | `poetry` | `NotebookText` |
| `poet-about` | `poetry` | `UserPen` |
| `poet-profile` | `poetry` | `IdCard` |
| `poetry-figure` | `poetry` | `Sun` |
| `occasion-cards` | `poetry` | `CalendarHeart` |
| `book-banner` | `poetry` | `BookMarked` |
| `media-cards` | `poetry` | `Headphones` |
| `media-archive` | `poetry` | `Disc3` |
| `shop-showcase` | `poetry` | `Gem` |
| `poetry-shop` | `poetry` | `Frame` |
| `poetry-product` | `poetry` | `PictureInPicture2` |
| `poetry-footer` | `poetry` | `PanelBottomClose` |
| `poetry-site-footer` | `poetry` | `PanelBottomOpen` |
| `cafe-table-booking` | `cafe` | `CalendarCheck` |

## Duplicate widgets — proposed merges (not done yet)

Rule: one generic widget with settings for every site; never a site/vertical copy. Old keys stay as **aliases** (registry maps `oldKey -> { type: newKey, preset }` on load) so saved pages keep rendering. No keys/props were changed in this commit.

| Keep (generic) | Merge in as alias + preset | Settings to add to the generic widget |
|---|---|---|
| `site-header` | `store-header`, `poetry-nav` | layout preset (classic/store/capsule), search toggle, logo position, sticky, glass |
| `site-footer` | `store-footer`, `poetry-footer`, `poetry-site-footer` | columns, palette (brand/dark/maroon), socials, licences slider, ornament pattern |
| `nav-menu` | `menu`, `nav-dropdown` (`mega-menu` = `nav-menu` with `mega: true`) | depth, direction, mega-panel |
| `hero-slider` | `poetry-hero`, `image-carousel` (hero mode) | slide media side, vertical verse text, autoplay |
| `section-heading` | `poetry-page-hero` | breadcrumb toggle, two-tone title |
| `loop-grid` | `product-grid`, `product-carousel`, `best-sellers`, `most-viewed`, `recently-viewed`, `blog-posts`, `blog-teasers`, `blog-slider`, `shop-showcase`, `media-cards`, `media-archive`, `poem-list`, `poem-archive` | source (products/posts/poems/media), query, card template, grid/carousel/numbered, audio play button |
| `archive-filters` | `filter-panel`, `loop-filter`, `price-filter`, `poem-search` | facet list incl. price range, AJAX target |
| `product-detail` | `poetry-product` | gallery style, frame options (variants) |
| `poem-detail` | `poem-single` | paper style, meta box, related toggle |
| `poet-about` | `poet-profile` | photo on/off, story, timeline |
| `toc` | `blog-toc` | source (auto headings / manual) |
| `badges` | `trust-badges` | style preset |
| `brand-row` | `brand-slider` | carousel toggle |
| `banner-grid` | `promo-trio`, `special-banners`, `promo-banner` | count, tone (dark/light), layout |
| `account-dashboard` | `account` | tabs shown |
| `flex-container` | `container` | (container = flex preset) |

Classic page widgets (`classic-order-track`, `classic-wishlist`, `classic-compare`, `classic-not-found`) should get a `variant` setting rather than separate modern copies.
