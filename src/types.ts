export type Lang = "en" | "am" | "sid";
export type Theme = "light" | "dark";
export type ServiceType = "dine-in" | "takeaway" | "delivery";
export type PaymentMethod = "cash" | "telebirr" | "cbe";
export type ProofStatus = "none" | "pending" | "approved" | "rejected";
export type OrderStatus =
  | "placed"
  | "payment_pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "dispatched"
  | "completed"
  | "cancelled";
export type CategoryId = "mains" | "breakfast" | "fish" | "fasting" | "drinks" | "juice";
export type BaseChoice = "Injera" | "Bread" | "None";

export interface Category {
  id: CategoryId;
  en: string;
  am: string;
  sid: string;
}

export interface MenuItem {
  id: string;
  name: string;
  nameAm: string;
  nameSid: string;
  desc?: string;
  descAm?: string;
  descSid?: string;
  price: number;
  category: CategoryId;
  image: string;
  spice: number;
  rating: number;
  popular: boolean;
  fasting: boolean;
  inStock: boolean;
}

export interface CartItem {
  uid: string;
  itemId: string;
  name: string;
  basePrice: number;
  qty: number;
  base: BaseChoice;
  spice: number;
  extras: string[];
  extraPrice: number;
  note: string;
}

export interface Order {
  id: string;
  code: string;
  createdAt: number;
  scheduledFor: number | null;
  customerName: string;
  phone: string;
  service: ServiceType;
  zone: string;
  distanceKm: number;
  address: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  serviceCharge: number;
  total: number;
  payment: PaymentMethod;
  proofStatus: ProofStatus;
  proofImage: string;
  proofNote: string;
  status: OrderStatus;
  eta: number;
  staffNote: string;
  userId?: string | null;
  guestLookupToken?: string | null;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface StoryPillar {
  title: string;
  desc: string;
}

export interface SocialLinks {
  instagram?: string;
  telegram?: string;
  tiktok?: string;
  facebook?: string;
  youtube?: string;
}

export interface PromoBanner {
  enabled: boolean;
  badge: string;
  title: string;
  description: string;
  code: string;
  ctaText: string;
  ctaLink: string;
  imageUrl?: string;
}

export interface SectionVisibility {
  announcement: boolean;
  heroBadge: boolean;
  featured: boolean;
  story: boolean;
  promoBanner: boolean;
  visit: boolean;
  faq: boolean;
}

export interface BrandAppearance {
  brandColor: string;
  accentColor: string;
  fontTheme: "modern" | "classic" | "warm";
  headerStyle: "glass" | "solid";
  primaryColor?: string;
  fontFamily?: string;
}

export interface PoliciesInfo {
  delivery: string;
  returns: string;
  privacy: string;
  terms: string;
}

export interface Cms {
  // Brand & Header
  brandName: string;
  brandTagline: string;
  announcement: string;
  announcementLink?: string;
  logoUrl?: string;

  // Hero Section
  heroLocation: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroCtaLink: string;
  heroSecondaryCtaText: string;
  heroSecondaryCtaLink: string;
  heroImage: string;
  heroOpenBadge: string;

  // Featured Section
  featuredEyebrow: string;
  bannerTitle: string;
  bannerSub: string;
  featuredIds?: string[];

  // Story / About Section
  storyEyebrow: string;
  storyTitle: string;
  storyBody: string;
  storyImage: string;
  storyPillars: StoryPillar[];

  // Promotional Banner
  promoBanner: PromoBanner;

  // Visit & Contact
  visitEyebrow: string;
  visitTitle: string;
  visitSub: string;
  hours: string;
  phone: string;
  email: string;
  address: string;
  directionsNote?: string;

  // FAQ
  faqs: FaqItem[];

  // Policies
  policies: PoliciesInfo;

  // Footer & Social
  footerAbout: string;
  copyrightText: string;
  socials: SocialLinks;

  // Visibility & Appearance
  visibility: SectionVisibility;
  appearance: BrandAppearance;

  // Metadata
  lastPublishedAt?: number;
  publishedBy?: string;
}

export interface DeliveryDestination {
  id: string;
  name: string;
  distanceKm: number;
  enabled: boolean;
}

export interface DeliverySettings {
  enabled: boolean;
  destinations: DeliveryDestination[];
  updatedAt?: number;
  updatedBy?: string;
}

export interface Session {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  otp?: string;
  verified: boolean;
  at: number;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session?: Session | null;
  needsEmailVerification?: boolean;
  unverified?: boolean;
}

export interface ExtraOption {
  id: string;
  name: string;
  price: number;
  enabled: boolean;
}

export interface GurshaState {
  menu: MenuItem[];
  orders: Order[];
  extras: ExtraOption[];
  cms: Cms;
  cart: CartItem[];
  session: Session | null;
  authLoading: boolean;
  adminAuthed: boolean;
  adminOtp: string;
  lang: Lang;
  theme: Theme;
  service: ServiceType;
  serviceChosen: boolean;
  deliverySettings: DeliverySettings;
  guestOrderCodes: string[];
  guestTokens: Record<string, string>;
}

export interface CartOptions {
  qty: number;
  base: BaseChoice;
  spice?: number;
  extras: string[];
  extraPrice: number;
  note: string;
}

export interface PlaceInput {
  customerName: string;
  phone: string;
  service?: ServiceType;
  zone?: string;
  distanceKm?: number;
  address?: string;
  scheduledFor: number | null;
  payment: PaymentMethod;
  proofImage: string;
  proofNote: string;
}

export interface GurshaContextValue extends GurshaState {
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  cartCount: number;
  cartSubtotal: number;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setService: (s: ServiceType, chosen?: boolean) => void;
  t: (k: string) => string;
  addToCart: (item: MenuItem, o: CartOptions) => void;
  setQty: (uid: string, qty: number) => void;
  removeFromCart: (uid: string) => void;
  clearCart: () => void;
  placeOrder: (i: PlaceInput) => Promise<Order>;
  setStatus: (code: string, s: OrderStatus) => Promise<{ success: boolean; error?: string }>;
  advance: (code: string) => Promise<{ success: boolean; error?: string }>;
  submitProof: (code: string, image: string, note?: string) => Promise<{ success: boolean; error?: string }>;
  approveProof: (code: string) => Promise<{ success: boolean; error?: string }>;
  rejectProof: (code: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  requestOtp: (arg1: string, arg2?: string) => Promise<AuthResult>;
  verifyOtp: (code: string, phoneOverride?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  requestAdminOtp: (phone: string) => Promise<AuthResult>;
  verifyAdminOtp: (code: string, phoneOverride?: string) => Promise<AuthResult>;
  adminLogout: () => Promise<void>;
  requestEmailOtp: (email: string, name?: string) => Promise<AuthResult>;
  verifyEmailOtp: (email: string, code: string) => Promise<AuthResult>;
  requestAdminEmailOtp: (email: string) => Promise<AuthResult>;
  verifyAdminEmailOtp: (email: string, code: string) => Promise<AuthResult>;
  linkCustomerPhone: (phone: string) => Promise<AuthResult>;
  updateCustomerProfile: (fullName: string, phone: string) => Promise<AuthResult>;
  signUpCustomer: (email: string, password: string, name: string, phone?: string) => Promise<AuthResult>;
  signInCustomer: (email: string, password: string) => Promise<AuthResult>;
  resendVerification: (email: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  verifyPasswordResetOtp: (email: string, code: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signInAdmin: (email: string, password: string) => Promise<AuthResult>;
  changeAdminPassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<AuthResult>;
  claimGuestOrder: (code: string, token: string) => Promise<{ success: boolean; error?: string }>;
  fetchOrderDetails: (code: string, forceFresh?: boolean) => Promise<Order | null>;
  saveMenuItem: (item: MenuItem) => void;
  deleteMenuItem: (id: string) => void;
  toggleStock: (id: string) => void;
  saveCms: (c: Cms) => Promise<Cms>;
  restoreDefaultCms?: () => Promise<void>;
  refreshCms: () => Promise<void>;
  refreshMenu?: () => Promise<void>;
  resetDemo: () => void;
  saveDeliverySettings: (settings: DeliverySettings) => Promise<void>;
  saveExtras: (extras: ExtraOption[]) => Promise<void>;
  saveExtraItem: (extra: ExtraOption) => Promise<void>;
  toggleExtraStatus: (id: string) => Promise<void>;
  deleteExtraItem: (id: string) => Promise<void>;
}