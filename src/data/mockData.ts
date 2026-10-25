import type { Category, Cms, DeliverySettings, ExtraOption, Lang, MenuItem } from "../types";

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

import { TRANSLATIONS } from "./translations";

export const MENU: MenuItem[] = [
  {
    id: "doro",
    name: "Special Doro Wat",
    nameAm: "ስፔሻል ዶሮ ወጥ",
    nameSid: "Dooro Wati",
    desc: "Slow-simmered chicken in aged berbere with a farm egg and ayib.",
    descAm: "በጥንቃቄ የተሰራ የዶሮ ወጥ ከእንቁላልና ከአይብ ጋር የቀረበ።",
    descSid: "Dooro wati laalcho kukkii nna ayibbaho ledo qixxaawino.",
    price: 420,
    category: "mains",
    image: IMG.doro,
    spice: 3,
    rating: 5,
    popular: true,
    fasting: false,
    inStock: true,
  },
  {
    id: "kitfo",
    name: "Special Kitfo",
    nameAm: "ስፔሻል ክትፎ",
    nameSid: "Kitfo Adda",
    desc: "Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.",
    descAm: "በቅቤና በሚጥሚጣ የተዘጋጀ የላም ስጋ ክትፎ ከአይብና ከጎመን ጋር።",
    descSid: "Siga mitmita nna qiba ledo qixxaawino kitfo ayibbu ledo.",
    price: 520,
    category: "mains",
    image: IMG.kitfo,
    spice: 3,
    rating: 5,
    popular: true,
    fasting: false,
    inStock: true,
  },
  {
    id: "siga",
    name: "Siga Tibs",
    nameAm: "ስጋ ጥብስ",
    nameSid: "Siga Tibsi",
    desc: "Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.",
    descAm: "በስሱ የተጠበሰ የበሬ ስጋ በሽንኩርት፣ ቃሪያ እና ሮዝሜሪ።",
    descSid: "Siga tibsi shunkurti nna qaraari ledo hanoote assine qixxeessinoonni.",
    price: 460,
    category: "mains",
    image: IMG.kitfo,
    spice: 2,
    rating: 4,
    popular: false,
    fasting: false,
    inStock: true,
  },
  {
    id: "fish",
    name: "Hawassa Asa Tibs",
    nameAm: "የሐዋሳ ዓሳ ጥብስ",
    nameSid: "Hawassa Asa Tibsi",
    desc: "Crisp tilapia from Lake Hawassa with lime, onion and awaze.",
    descAm: "ከሐዋሳ ሐይቅ የተያዘ ትኩስ የዓሳ ጥብስ ከሎሚ እና አዋዜ ጋር።",
    descSid: "Hawassa asii tibsi loomi nna awaaze ledo qixxaawino.",
    price: 480,
    category: "fish",
    image: IMG.fish,
    spice: 2,
    rating: 5,
    popular: true,
    fasting: false,
    inStock: true,
  },
  {
    id: "chechebsa",
    name: "Chechebsa",
    nameAm: "ጨጨብሳ",
    nameSid: "Chechebsa",
    desc: "Shredded kita in spiced butter and berbere with a drizzle of honey.",
    descAm: "የተቆራረጠ ቂጣ በንጥር ቅቤ እና በርበሬ ከማር ጋር የተዘጋጀ።",
    descSid: "Kita qiba nna maalo ledo qixxaabbino chechebsa.",
    price: 190,
    category: "breakfast",
    image: IMG.chechebsa,
    spice: 1,
    rating: 4,
    popular: true,
    fasting: false,
    inStock: true,
  },
  {
    id: "firfir",
    name: "Quanta Firfir",
    nameAm: "ቋንጣ ፍርፍር",
    nameSid: "Firfir",
    desc: "Dried beef torn into warm berbere sauce with injera.",
    descAm: "የደረቀ የበሬ ስጋ (ቋንጣ) በእንጀራ ፍርፍር የተሰራ።",
    descSid: "Quanta siga berbere wati nna injera ledo firfirame qixxaawino.",
    price: 260,
    category: "breakfast",
    image: IMG.doro,
    spice: 2,
    rating: 4,
    popular: false,
    fasting: false,
    inStock: true,
  },
  {
    id: "shiro",
    name: "Shiro Tegabino",
    nameAm: "ሽሮ ተጋቢኖ",
    nameSid: "Shiro Tegabino",
    desc: "Silky chickpea stew with garlic, ginger and ground chili.",
    descAm: "በሸክላ ድስት የሚንተከተክ የሽሮ ወጥ በነጭ ሽንኩርትና ዝንጅብል።",
    descSid: "Shiro tegabino hanoote xaarami wati qixxaawino.",
    price: 190,
    category: "fasting",
    image: IMG.shiro,
    spice: 2,
    rating: 5,
    popular: true,
    fasting: true,
    inStock: true,
  },
  {
    id: "gomen",
    name: "Gomen be Siga",
    nameAm: "ጎመን በስጋ",
    nameSid: "Gomen",
    desc: "Collard greens braised with beef and cardamom.",
    descAm: "ትኩስ የሀበሻ ጎመን ከለስላሳ የበሬ ስጋ ጋር የተሰራ።",
    descSid: "Gomeni siga ledo afamino malaati wati.",
    price: 240,
    category: "fasting",
    image: IMG.shiro,
    spice: 1,
    rating: 4,
    popular: false,
    fasting: false,
    inStock: true,
  },
  {
    id: "gomenkai",
    name: "Fasting Combo",
    nameAm: "የጾም ምርጫ",
    nameSid: "Soora Dooro",
    desc: "Shiro, gomen, misir wot and salad on one injera platter.",
    descAm: "ሽሮ፣ ምስር ወጥ፣ አልጫ ክክ፣ ጎመን እና ሰላጣ በአንድ ላይ።",
    descSid: "Shiro, misira wati, gomeni nna salaata mitte injera aana.",
    price: 300,
    category: "fasting",
    image: IMG.shiro,
    spice: 2,
    rating: 5,
    popular: false,
    fasting: true,
    inStock: true,
  },
  {
    id: "buna",
    name: "Buna Ceremony (Jebena)",
    nameAm: "የቡና ሥርዓት",
    nameSid: "Buna Loosa",
    desc: "Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.",
    descAm: "በጀበና የተፈላ ትኩስ የይርጋጨፌ ቡና ከእጣን ጭስ ጋር።",
    descSid: "Yirgaacheffete buna jebennanni qixxeessine loonsoonni.",
    price: 160,
    category: "drinks",
    image: IMG.buna,
    spice: 0,
    rating: 5,
    popular: true,
    fasting: true,
    inStock: true,
  },
  {
    id: "macchiato",
    name: "Gursha Macchiato",
    nameAm: "ጉርሻ ማኪያቶ",
    nameSid: "Macchiato",
    desc: "Double espresso with steamed milk, Sidaama sweetener.",
    descAm: "ጥቁር ኤስፕሬሶ ከወተት አረፋ ጋር የተዘጋጀ ምርጥ ማኪያቶ።",
    descSid: "Espresso adote ledo qixxaawino macchiato.",
    price: 90,
    category: "drinks",
    image: IMG.buna,
    spice: 0,
    rating: 4,
    popular: false,
    fasting: true,
    inStock: true,
  },
  {
    id: "tej",
    name: "Tej Honey Cooler",
    nameAm: "ጠጅ ቀዝቃዛ",
    nameSid: "Tej",
    desc: "Fermented honey refresher served over ice with lemon.",
    descAm: "ከንጹሕ ማር የተዘጋጀ ቀዝቃዛ ባህላዊ መጠጥ።",
    descSid: "Maalote tejji qorraashsha ledo qixxaawino.",
    price: 150,
    category: "drinks",
    image: IMG.buna,
    spice: 0,
    rating: 4,
    popular: false,
    fasting: true,
    inStock: false,
  },
  {
    id: "spris",
    name: "Avocado Spris",
    nameAm: "አቮካዶ ስፕሪስ",
    nameSid: "Avocaado Spris",
    desc: "Layered avocado and mango with lime, served with a spoon.",
    descAm: "የተደራረበ ትኩስ የአቮካዶ እና የማንጎ ጭማቂ ከሎሚ ጋር።",
    descSid: "Avokaadonna maango woshsha loomi ledo qixxaawino.",
    price: 130,
    category: "juice",
    image: IMG.juice,
    spice: 0,
    rating: 5,
    popular: true,
    fasting: true,
    inStock: true,
  },
  {
    id: "mango",
    name: "Mango Juice",
    nameAm: "የማንጎ ጭማቂ",
    nameSid: "Maango Woshsha",
    desc: "Fresh pressed mango, no sugar added.",
    descAm: "ንጹሕ የተጨመቀ የማንጎ ጭማቂ ያለ ስኳር።",
    descSid: "Haaro maangote woshsha sukkara hoogiro.",
    price: 110,
    category: "juice",
    image: IMG.juice,
    spice: 0,
    rating: 4,
    popular: false,
    fasting: true,
    inStock: true,
  },
];

export const BASE_OPTIONS = [
  { label: "Injera", price: 0 },
  { label: "Kita bread", price: 25 },
  { label: "No base", price: 0 },
] as const;

export const DEFAULT_EXTRAS: ExtraOption[] = [
  { id: "extra-injera", name: "Extra injera", price: 30, enabled: true },
  { id: "ayib-cheese", name: "Ayib cheese", price: 45, enabled: true },
  { id: "boiled-egg", name: "Boiled egg", price: 35, enabled: true },
  { id: "extra-awaze", name: "Extra awaze", price: 20, enabled: true },
];

export const EXTRA_OPTIONS = DEFAULT_EXTRAS.map((e) => ({
  label: e.name,
  price: e.price,
}));

export const DRINK_ADDONS: { label: string; price: number }[] = [];

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

export const T: Record<Lang, Record<string, string>> = TRANSLATIONS;

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
  heroCtaText: "Order now",
  heroCtaLink: "/menu",
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