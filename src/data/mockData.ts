import type { Category, Cms, DeliverySettings, Lang, MenuItem } from "../types";

export const IMG = {
  hero: "/images/gursha-hero.webp",
  feast: "/images/gursha-feast.webp",
  doro: "/images/dish-doro-wat.webp",
  fish: "/images/dish-fried-fish.webp",
  shiro: "/images/dish-shiro.webp",
  kitfo: "/images/dish-kitfo.webp",
  chechebsa: "/images/dish-chechebsa.webp",
  juice: "/images/dish-avocado-juice.webp",
  buna: "/images/dish-buna.webp",
};

export const CATEGORIES: Category[] = [
  { id: "mains", en: "Mains", am: "ዋና ምግቦች", sid: "Xaado Daggineemmo" },
  { id: "breakfast", en: "Breakfast", am: "ቁርስ", sid: "Maalado" },
  { id: "fish", en: "Lake Fish", am: "የሐዋሳ ዓሳ", sid: "Hawassa Asa" },
  { id: "fasting", en: "Fasting", am: "ጾም", sid: "Soora" },
  { id: "drinks", en: "Coffee & Drinks", am: "ቡናና መጠጦች", sid: "Bunaanna Uyye" },
  { id: "juice", en: "Juice & Spris", am: "ጭማቂ", sid: "Woshsha" },
];

export const MENU: MenuItem[] = [
  { id: "doro", name: "Special Doro Wat", nameAm: "ስፔሻል ዶሮ ወጥ", nameSid: "Dooro Wati", desc: "Slow-simmered chicken in aged berbere with a farm egg and ayib.", price: 420, category: "mains", image: IMG.doro, spice: 3, rating: 5, popular: true, fasting: false, inStock: true },
  { id: "kitfo", name: "Special Kitfo", nameAm: "ስፔሻል ክትፎ", nameSid: "Kitfo Adda", desc: "Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.", price: 520, category: "mains", image: IMG.kitfo, spice: 3, rating: 5, popular: true, fasting: false, inStock: true },
  { id: "siga", name: "Siga Tibs", nameAm: "ስጋ ጥብስ", nameSid: "Siga Tibsi", desc: "Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.", price: 460, category: "mains", image: IMG.kitfo, spice: 2, rating: 4, popular: false, fasting: false, inStock: true },
  { id: "fish", name: "Hawassa Asa Tibs", nameAm: "የሐዋሳ ዓሳ ጥብስ", nameSid: "Hawassa Asa Tibsi", desc: "Crisp tilapia from Lake Hawassa with lime, onion and awaze.", price: 480, category: "fish", image: IMG.fish, spice: 2, rating: 5, popular: true, fasting: false, inStock: true },
  { id: "chechebsa", name: "Chechebsa", nameAm: "ጨጨብሳ", nameSid: "Chechebsa", desc: "Shredded kita in spiced butter and berbere with a drizzle of honey.", price: 190, category: "breakfast", image: IMG.chechebsa, spice: 1, rating: 4, popular: true, fasting: false, inStock: true },
  { id: "firfir", name: "Quanta Firfir", nameAm: "ቋንጣ ፍርፍር", nameSid: "Firfir", desc: "Dried beef torn into warm berbere sauce with injera.", price: 260, category: "breakfast", image: IMG.doro, spice: 2, rating: 4, popular: false, fasting: false, inStock: true },
  { id: "shiro", name: "Shiro Tegabino", nameAm: "ሽሮ ተጋቢኖ", nameSid: "Shiro Tegabino", desc: "Silky chickpea stew with garlic, ginger and ground chili.", price: 190, category: "fasting", image: IMG.shiro, spice: 2, rating: 5, popular: true, fasting: true, inStock: true },
  { id: "gomen", name: "Gomen be Siga", nameAm: "ጎመን በስጋ", nameSid: "Gomen", desc: "Collard greens braised with beef and cardamom.", price: 240, category: "fasting", image: IMG.shiro, spice: 1, rating: 4, popular: false, fasting: false, inStock: true },
  { id: "gomenkai", name: "Fasting Combo", nameAm: "የጾም ምርጫ", nameSid: "Soora Dooro", desc: "Shiro, gomen, misir wot and salad on one injera platter.", price: 300, category: "fasting", image: IMG.shiro, spice: 2, rating: 5, popular: false, fasting: true, inStock: true },
  { id: "buna", name: "Buna Ceremony (Jebena)", nameAm: "የቡና ሥርዓት", nameSid: "Buna Loosa", desc: "Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.", price: 160, category: "drinks", image: IMG.buna, spice: 0, rating: 5, popular: true, fasting: true, inStock: true },
  { id: "macchiato", name: "Gursha Macchiato", nameAm: "ጉርሻ ማኪያቶ", nameSid: "Macchiato", desc: "Double espresso with steamed milk, Sidaama sweetener.", price: 90, category: "drinks", image: IMG.buna, spice: 0, rating: 4, popular: false, fasting: true, inStock: true },
  { id: "tej", name: "Tej Honey Cooler", nameAm: "ጠጅ ቀዝቃዛ", nameSid: "Tej", desc: "Fermented honey refresher served over ice with lemon.", price: 150, category: "drinks", image: IMG.buna, spice: 0, rating: 4, popular: false, fasting: true, inStock: false },
  { id: "spris", name: "Avocado Spris", nameAm: "አቮካዶ ስፕሪስ", nameSid: "Avocaado Spris", desc: "Layered avocado and mango with lime, served with a spoon.", price: 130, category: "juice", image: IMG.juice, spice: 0, rating: 5, popular: true, fasting: true, inStock: true },
  { id: "mango", name: "Mango Juice", nameAm: "የማንጎ ጭማቂ", nameSid: "Maango Woshsha", desc: "Fresh pressed mango, no sugar added.", price: 110, category: "juice", image: IMG.juice, spice: 0, rating: 4, popular: false, fasting: true, inStock: true },
];

export const BASE_OPTIONS = [
  { label: "Injera", price: 0 },
  { label: "Kita bread", price: 25 },
  { label: "No base", price: 0 },
] as const;

export const EXTRA_OPTIONS = [
  { label: "Extra injera", price: 30 },
  { label: "Ayib cheese", price: 45 },
  { label: "Boiled egg", price: 35 },
  { label: "Extra awaze", price: 20 },
];

export const DRINK_ADDONS = [
  { label: "Ethiopian coffee", price: 60 },
  { label: "Soft drink", price: 45 },
  { label: "Ambo water", price: 40 },
];

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  enabled: true,
  destinations: [
    { id: "main-campus", name: "Main Campus", distanceKm: 2, enabled: true },
    { id: "techno-campus", name: "Techno Campus", distanceKm: 4, enabled: true },
  ],
};

export const DELIVERY_ZONES = [
  { id: "main-campus", label: "Main Campus", km: 2 },
  { id: "techno-campus", label: "Techno Campus", km: 4 },
];

export const zoneFee = (km: number) => 30 + km * 10;

export const serviceLabels: Record<string, { en: string; am: string; sid: string }> = {
  "dine-in": { en: "Dine-In", am: "በቦታው ላይ", sid: "Hikke" },
  takeaway: { en: "Takeaway", am: "መውሰጃ", sid: "Adhama" },
  delivery: { en: "Delivery", am: "ማድረሻ", sid: "Sokka" },
};

export const T: Record<Lang, Record<string, string>> = {
  en: {
    "nav.home": "Home", "nav.menu": "Menu", "nav.orders": "My Orders", "nav.admin": "Admin",
    "svc.dineIn": "Dine-In", "svc.takeaway": "Takeaway", "svc.delivery": "Delivery",
    "hero.title": "Hawassa flavour, one gursha at a time",
    "hero.sub": "Lake fish, slow-cooked doro wat and a live coffee ceremony — served in our café or brought to your door.",
    "hero.cta": "Choose your service", "hero.menu": "Explore the menu",
    "home.featured": "Guest favourites", "home.featuredSub": "The plates Hawassa keeps ordering",
    "home.storyTitle": "The Gursha story", "home.storyBody": "In Ethiopia, a gursha is the first bite you offer someone you love. We built a café around that gesture: warm light, clay cups, and food meant to be shared.",
    "home.visitTitle": "Find us", "home.openNow": "Open now",
    "menu.title": "Our menu", "menu.sub": "Traditional plates, fasting choices and fresh spris",
    "menu.search": "Search a dish", "menu.all": "All", "menu.add": "Add to cart", "menu.customize": "Customise",
    "menu.outOfStock": "Unavailable", "menu.empty": "No dishes match your search",
    "cart.title": "Your cart", "cart.empty": "Your cart is empty", "cart.checkout": "Go to checkout", "cart.continue": "Keep browsing", "cart.promo": "Promo code",
    "checkout.title": "Checkout", "checkout.place": "Place order", "checkout.total": "Total", "checkout.summary": "Order summary",
    "orders.title": "My orders", "orders.empty": "No orders yet", "orders.track": "Track", "orders.receipt": "Receipt", "orders.print": "Print",
    "profile.title": "Profile", "profile.login": "Sign in with phone", "profile.logout": "Sign out",
    "admin.title": "Admin hub", "admin.signIn": "Sign in",
    "status.placed": "Order placed", "status.payment_pending": "Awaiting payment", "status.accepted": "Accepted",
    "status.preparing": "Preparing", "status.ready": "Ready", "status.dispatched": "Out for delivery",
    "status.completed": "Completed", "status.cancelled": "Cancelled",
    "common.etb": "ETB", "common.save": "Save", "common.cancel": "Cancel", "common.close": "Close", "common.reset": "Reset to default",
  },
  am: {
    "nav.home": "መነሻ", "nav.menu": "ምናሌ", "nav.orders": "ትዕዛዞቼ", "nav.support": "ድጋፍ", "nav.admin": "አስተዳደር",
    "svc.dineIn": "በቦታው ላይ", "svc.takeaway": "መውሰጃ", "svc.delivery": "ማድረሻ",
    "hero.title": "የሐዋሳ ጣዕም በአንድ ጉርሻ",
    "hero.sub": "የሐዋሳ ዓሳ፣ በዝግታ የተሰራ ዶሮ ወጥ እና ቀጥታ የቡና ሥርዓት — በምግብ ቤታችን ወይም በቤትዎ።",
    "hero.cta": "አገልግሎት ይምረጡ", "hero.menu": "ምናሌውን ይመልከቱ",
    "home.featured": "የደንበኞች ምርጫ", "home.featuredSub": "ሐዋሳ ደጋግሞ የሚያዘዛቸው ምግቦች",
    "home.storyTitle": "የጉርሻ ታሪክ", "home.storyBody": "ኢትዮጵያ ውስጥ ጉርሻ ማለት ለሚወዱት ሰው የሚያቀርቡት የመጀመሪያ ቁራሽ ነው። በዚህ ምልክት ላይ የተመሰረተ ምግብ ቤት ሰራን።",
    "home.visitTitle": "ያግኙን", "home.openNow": "አሁን ክፍት ነን",
    "menu.title": "ምናሌአችን", "menu.sub": "ባህላዊ ምግቦች፣ የጾም ምርጫዎችና ትኩስ ጭማቂ",
    "menu.search": "ምግብ ይፈልጉ", "menu.all": "ሁሉም", "menu.add": "ወደ ጋሪ ጨምር", "menu.customize": "አስተካክል",
    "menu.outOfStock": "አልተገኘም", "menu.empty": "ምንም ምግብ አልተገኘም",
    "cart.title": "የእርስዎ ጋሪ", "cart.empty": "ጋሪዎ ባዶ ነው", "cart.checkout": "ወደ ክፍያ", "cart.continue": "ግዢ ይቀጥሉ", "cart.promo": "የማስተዋወቂያ ኮድ",
    "checkout.title": "ክፍያ", "checkout.place": "ትዕዛዝ ያስገቡ", "checkout.total": "ጠቅላላ", "checkout.summary": "የትዕዛዝ ማጠቃለያ",
    "orders.title": "ትዕዛዞቼ", "orders.empty": "እስካሁን ትዕዛዝ የለም", "orders.track": "ይከታተሉ", "orders.receipt": "ደረሰኝ", "orders.print": "አትም", "orders.review": "ግምገማ ይስጡ",
    "profile.title": "መገለጫ", "profile.login": "በስልክ ይግቡ", "profile.logout": "ውጣ",
    "support.title": "የደንበኛ ድጋፍ", "support.placeholder": "መልእክት ይጻፉ", "support.send": "ላክ",
    "admin.title": "የአስተዳደር ማዕከል", "admin.signIn": "ግባ",
    "status.placed": "ትዕዛዝ ተቀብሏል", "status.payment_pending": "ክፍያ በመጠባበቅ", "status.accepted": "ተቀባይነት አግኝቷል",
    "status.preparing": "በዝግጅት ላይ", "status.ready": "ተዘጋጅቷል", "status.dispatched": "በመንገድ ላይ",
    "status.completed": "ተጠናቅቋል", "status.cancelled": "ተሰርዟል",
    "common.etb": "ብር", "common.save": "አስቀምጥ", "common.cancel": "ተው", "common.close": "ዝጋ", "common.reset": "ዳታ እንደነበር መልስ",
  },
  sid: {
    "nav.home": "Mine", "nav.menu": "Xaado", "nav.orders": "Ajajjate", "nav.support": "Kaaloo", "nav.admin": "Gashshoota",
    "svc.dineIn": "Hikke", "svc.takeaway": "Adhama", "svc.delivery": "Sokka",
    "hero.title": "Hawassa xaadu, mitte gurshanni",
    "hero.sub": "Hawassa asa, doro wati qixxaantino nna buna loosu loosaati — ninke minanni woy abbaanki.",
    "hero.cta": "Loosa doori", "hero.menu": "Xaado daari",
    "home.featured": "Daggineemmo doorantinokka", "home.featuredSub": "Hawassanu baala yaa'rate xaado",
    "home.storyTitle": "Gursha duri", "home.storyBody": "Itiyoophiyankanni gursha jeelote loosaati: hantoote assineemmo mittu xaado. Ku xaadokki ninke mina ixaantinoonni.",
    "home.visitTitle": "Nu kaa'li", "home.openNow": "Xaa tiro loosoonni",
    "menu.title": "Ninke xaado", "menu.sub": "Hera xaadoonni soora doorantinokka haaro woshshu",
    "menu.search": "Xaado kaa'li", "menu.all": "Baallaa", "menu.add": "Gurbaanni ledi", "menu.customize": "Worididi",
    "menu.outOfStock": "Hin jirro", "menu.empty": "Xaado hin argiteemmo",
    "cart.title": "Ninke gurbaana", "cart.empty": "Gurbaanni mulla", "cart.checkout": "Bittote", "cart.continue": "Xaado iti loosi", "cart.promo": "Koodii",
    "checkout.title": "Bittote", "checkout.place": "Ajajja ledi", "checkout.total": "Wonsho", "checkout.summary": "Ajajja gudanno",
    "orders.title": "Ninke ajajjate", "orders.empty": "Ajajja hin jirro", "orders.track": "Hordofi", "orders.receipt": "Waraqata", "orders.print": "Attami", "orders.review": "Gamu guddi",
    "profile.title": "Ninke umanno", "profile.login": "Bilbilanni eo", "profile.logout": "Fuli",
    "support.title": "Daggineemmo kaaloo", "support.placeholder": "Wonshote xaadi", "support.send": "Sommo",
    "admin.title": "Gashshoota mina", "admin.signIn": "Eo",
    "status.placed": "Ajajja adda", "status.payment_pending": "Wonsho agaroonni", "status.accepted": "Adda magaanno",
    "status.preparing": "Qixxoonsa", "status.ready": "Qixxaanti", "status.dispatched": "Sokka hantino",
    "status.completed": "Gudanti", "status.cancelled": "Heganti",
    "common.etb": "ETB", "common.save": "Suuqi", "common.cancel": "Tirsi", "common.close": "Dammi", "common.reset": "Daata bidiiri",
  },
};

export const STATUS_ORDER: string[] = ["placed", "payment_pending", "accepted", "preparing", "ready", "dispatched", "completed"];

export const SEED_CMS: Cms = {
  // Brand & Header
  brandName: "Gursha",
  brandTagline: "Café Hawassa",
  announcement: "Live now — free injera refills on dine-in.",
  announcementLink: "/menu",

  // Hero Section
  heroLocation: "Hawassa · Sidama Region",
  heroTitle: "Lake Hawassa's table for wood-fired flavours & slow wot",
  heroSubtitle: "From 40-year sourdough injera to freshly landed tilapia, Gursha brings the rich tapestry of southern Ethiopia together on one lakeside terrace.",
  heroCtaText: "Explore & order",
  heroCtaLink: "#service",
  heroSecondaryCtaText: "Full menu",
  heroSecondaryCtaLink: "/menu",
  heroImage: IMG.hero,
  heroOpenBadge: "Open Now",

  // Featured Section
  featuredEyebrow: "Today's selections",
  bannerTitle: "Today at Gursha",
  bannerSub: "Lake fish landed this morning. Buna ceremony roasting at 4pm on the terrace.",
  featuredIds: ["doro", "kitfo", "fish", "buna"],

  // Story / About Section
  storyEyebrow: "Our Story",
  storyTitle: "Born on the shores of Lake Hawassa",
  storyBody: "Gursha was founded to celebrate the intimacy of shared Ethiopian dining. We roast Yirgacheffe coffee beans over charcoal, simmer rich berbere wot in clay pots, and source fresh tilapia straight from local fishermen at sunrise.",
  storyImage: IMG.feast,
  storyPillars: [
    { title: "Roasted daily", desc: "Yirgacheffe beans over clay jebena" },
    { title: "Lake fresh", desc: "Tilapia straight from Hawassa fishermen" },
    { title: "Fasting menu", desc: "Always available with pure teff injera" },
    { title: "Family plates", desc: "Built for sharing and genuine gursha" },
  ],

  // Promotional Banner
  promoBanner: {
    enabled: false,
    badge: "",
    title: "",
    description: "",
    code: "",
    ctaText: "",
    ctaLink: "/menu",
    imageUrl: "",
  },

  // Visit & Contact
  visitEyebrow: "Visit Gursha",
  visitTitle: "Lake Shore Road, Hawassa",
  visitSub: "Join us on the breezy terrace overlooking the sunset.",
  hours: "Mon–Sun · 7:00 AM – 10:30 PM",
  phone: "+251 46 220 1188",
  email: "hello@gurshacafe.et",
  address: "Lake Shore Road, Hawassa, Sidama, Ethiopia",
  directionsNote: "Located 200m south of Hawassa Haile Resort, right along the lakeshore path.",

  // FAQ
  faqs: [
    {
      id: "faq-1",
      question: "Do you offer gluten-free or 100% teff injera?",
      answer: "Yes! All our traditional injera is baked with pure highland teff, naturally gluten-free and fermented for 3 days.",
    },
    {
      id: "faq-2",
      question: "How does table QR ordering work for dine-in?",
      answer: "Scan the QR code at your table, pick your favorite dishes and drinks, and submit your order. It reaches our kitchen immediately!",
    },
    {
      id: "faq-3",
      question: "What areas in Hawassa do you deliver to?",
      answer: "We deliver across central Hawassa, Piazza, Lake Shore, Millennium, and surrounding university districts within 40 minutes.",
    },
    {
      id: "faq-4",
      question: "What payment methods are supported?",
      answer: "We accept Telebirr, CBE Birr / Bank Transfer, and cash upon delivery or at the table.",
    },
  ],

  // Policies
  policies: {
    delivery: "Deliveries are dispatched within 25–40 minutes across Hawassa. Distance-based fees range from 50 to 120 ETB depending on your delivery zone.",
    returns: "Because our food is prepared fresh to order, cancellations can only be made within 5 minutes of placing an order. If you have any concerns with your meal, our team will replace it immediately or issue a refund.",
    privacy: "Your phone number and delivery location are used exclusively to process and deliver your order. We never share or sell customer data.",
    terms: "Orders are fulfilled subject to kitchen availability. Digital payments require uploading a valid transaction screenshot or reference number.",
  },

  // Footer & Social
  footerAbout: "A modern Ethiopian café in Hawassa — slow-cooked wot, fresh juice and Lake Hawassa views.",
  copyrightText: "© 2026 Gursha Café. All rights reserved.",
  socials: {
    instagram: "https://instagram.com/gursha_hawassa",
    telegram: "https://t.me/gursha_cafe",
    tiktok: "https://tiktok.com/@gurshacafe",
    facebook: "https://facebook.com/gurshacafehawassa",
  },

  // Visibility & Appearance
  visibility: {
    announcement: true,
    heroBadge: true,
    featured: true,
    story: true,
    promoBanner: true,
    visit: true,
    faq: true,
  },
  appearance: {
    brandColor: "#ea580c",
    accentColor: "#c2410c",
    fontTheme: "modern",
    headerStyle: "glass",
  },
};