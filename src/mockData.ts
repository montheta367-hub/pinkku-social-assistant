import { PlatformConnection, SocialPost, CustomerMessage, AIAgent, UserProfile } from './types';

// Shown before sign-up/login — no account, no data, redirected to the landing page.
export const guestUserProfile: UserProfile = {
  name: '',
  email: '',
  businessName: '',
  businessType: '',
  isLoggedIn: false,
};

// Sample data for the seeded demo account (amonthet5@gmail.com), used to showcase
// the product. Real signups start from `emptyConnections` / [] instead.
export const initialUserProfile: UserProfile = {
  id: 'usr_001',
  name: 'Aye Mon',
  email: 'amonthet5@gmail.com',
  businessName: "Pinkku Beauty & Lifestyle",
  businessType: 'E-commerce & Cosmetics',
  isLoggedIn: true,
  tier: 'pro',
  connectedPlatforms: ['facebook', 'instagram', 'tiktok', 'telegram', 'gmail']
};

export const emptyConnections: PlatformConnection[] = [
  { id: 'facebook', name: 'Facebook Page', category: 'social', icon: 'facebook', connected: false, followerCount: 0, color: '#1877F2', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'instagram', name: 'Instagram Shop', category: 'social', icon: 'instagram', connected: false, followerCount: 0, color: '#E4405F', badgeBg: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'tiktok', name: 'TikTok Seller', category: 'social', icon: 'tiktok', connected: false, followerCount: 0, color: '#000000', badgeBg: 'bg-slate-100 text-slate-800 border-slate-300' },
  { id: 'telegram', name: 'Telegram Bot & Channel', category: 'messaging', icon: 'send', connected: false, followerCount: 0, color: '#229ED9', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'gmail', name: 'Google Business Inbox', category: 'email', icon: 'mail', connected: false, followerCount: 0, color: '#EA4335', badgeBg: 'bg-red-50 text-red-700 border-red-200' },
];

export const initialConnections: PlatformConnection[] = [
  {
    id: 'facebook',
    name: 'Facebook Page',
    category: 'social',
    icon: 'facebook',
    connected: true,
    accountName: 'Pinkku Boutique Yangon',
    handle: '@pinkkuboutique.ygn',
    followerCount: 28400,
    lastSynced: '2 mins ago',
    unreadCount: 5,
    color: '#1877F2',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'instagram',
    name: 'Instagram Shop',
    category: 'social',
    icon: 'instagram',
    connected: true,
    accountName: 'pinkku.myanmar',
    handle: '@pinkku.myanmar',
    followerCount: 14200,
    lastSynced: '5 mins ago',
    unreadCount: 3,
    color: '#E4405F',
    badgeBg: 'bg-pink-50 text-pink-700 border-pink-200'
  },
  {
    id: 'tiktok',
    name: 'TikTok Seller',
    category: 'social',
    icon: 'tiktok',
    connected: true,
    accountName: 'Pinkku Trends MM',
    handle: '@pinkku_official_mm',
    followerCount: 45800,
    lastSynced: '10 mins ago',
    unreadCount: 8,
    color: '#000000',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300'
  },
  {
    id: 'telegram',
    name: 'Telegram Bot & Channel',
    category: 'messaging',
    icon: 'send',
    connected: true,
    accountName: 'Pinkku VIP Orders',
    handle: '@pinkku_vip_orders_bot',
    followerCount: 6200,
    lastSynced: 'Just now',
    unreadCount: 2,
    color: '#229ED9',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200'
  },
  {
    id: 'gmail',
    name: 'Google Business Inbox',
    category: 'email',
    icon: 'mail',
    connected: true,
    accountName: 'Aye Mon (Google Workspace)',
    handle: 'amonthet5@gmail.com',
    followerCount: 0,
    lastSynced: '1 min ago',
    unreadCount: 4,
    color: '#EA4335',
    badgeBg: 'bg-red-50 text-red-700 border-red-200'
  }
];

export const initialPosts: SocialPost[] = [
  {
    id: 'post_01',
    title: 'Thadingyut Mega Sale 30% Off',
    content: 'Special festival discount across all organic Korean skincare products! Order today and receive free delivery in Yangon & Mandalay.',
    myanmarContent: 'သီတင်းကျွတ် အထူးပရိုမိုးရှင်း! ကိုရီးယား အသားအရေထိန်းသိမ်းပစ္စည်းများ အားလုံး 30% လျှော့စျေးဖြင့် ဝယ်ယူရရှိနိုင်ပါပြီရှင်။ ရန်ကုန်နှင့် မန္တလေး အခမဲ့ပို့ဆောင်ပေးပါမည်။',
    platforms: ['facebook', 'instagram', 'telegram'],
    scheduledDate: '2026-08-15',
    scheduledTime: '18:00',
    status: 'scheduled',
    tone: 'Excited & Promotional',
    tags: ['#ThadingyutSale', '#PinkkuBeauty', '#SkincareMM', '#YangonShopping'],
    createdAt: '2026-08-14'
  },
  {
    id: 'post_02',
    title: 'Top 3 Morning Glow Tips',
    content: 'Start your morning with gentle hydration and daily SPF 50 sunscreen. Swipe right to see our top 3 picks for humid weather.',
    myanmarContent: 'မနက်ခင်းမှာ အသားအရေကြည်လင်တောက်ပစေဖို့ နံနက်တိုင်း မဖြစ်မနေ လိုက်နာသင့်တဲ့ အဆင့် (၃) ဆင့်။ နေလောင်ကာခရင်မ် လိမ်းဖို့ မမေ့ပါနဲ့နော်။',
    platforms: ['facebook', 'tiktok', 'instagram'],
    scheduledDate: '2026-08-14',
    scheduledTime: '10:30',
    status: 'published',
    likes: 428,
    comments: 64,
    shares: 31,
    reach: 6540,
    tone: 'Educational & Friendly',
    tags: ['#BeautyTips', '#MorningRoutine', '#GlowSkinMM'],
    createdAt: '2026-08-13'
  },
  {
    id: 'post_03',
    title: 'New Arrivals: Rose Water Mist',
    content: 'Hydrate your skin instantly with 100% natural Bulgarian rose water mist. Limited stock available.',
    myanmarContent: 'သဘာဝနှင်းဆီရေစစ်စစ် ၁၀၀% ဖြင့် ပြုလုပ်ထားသော Rose Water Mist ပစ္စည်းသစ် ရောက်ရှိပါပြီရှင်။ Stock အကန့်အသတ်ရှိလို့ အမြန်မှာယူလိုက်ပါနော်။',
    platforms: ['facebook', 'telegram'],
    scheduledDate: '2026-08-16',
    scheduledTime: '14:00',
    status: 'draft',
    tone: 'Elegant & Exclusive',
    tags: ['#NewArrival', '#RoseMist', '#PinkkuVIP'],
    createdAt: '2026-08-14'
  }
];

export const initialMessages: CustomerMessage[] = [
  {
    id: 'msg_01',
    customerName: 'Ma Hnin Wai',
    platform: 'facebook',
    message: 'မင်္ဂလာပါရှင်၊ Rose Water Mist လေး အခု order တင်ရင် မနက်ဖြန် ရောက်နိုင်မလားရှင်။ ရန်ကုန်၊ စမ်းချောင်းမြို့နယ်ပါ။',
    timestamp: '5 mins ago',
    status: 'unread',
    sentiment: 'urgent',
    orderIntent: true,
    suggestedReplyMyanmar: 'မင်္ဂလာပါရှင် မနှင်းဝေရှင့်။ ရန်ကုန် စမ်းချောင်းမြို့နယ်ဆိုရင် မနက်ဖြန် နေ့လယ်ပိုင်း အရောက် ပို့ဆောင်ပေးနိုင်ပါတယ်ရှင်။ မှာယူလိုပါက ဖုန်းနံပါတ်နှင့် လိပ်စာလေး ပေးပို့ပေးပါနော်။ ကျေးဇူးတင်ပါတယ်ရှင်။',
    suggestedReplyEnglish: 'Hello Ma Hnin Wai! For Sanchaung township in Yangon, we can deliver by tomorrow afternoon. Please provide your phone number and full delivery address. Thank you!'
  },
  {
    id: 'msg_02',
    customerName: 'Ko Aung Kyaw',
    platform: 'telegram',
    message: 'Lipstick shade #04 ရှိသေးလားခင်ဗျာ? KPay နဲ့ရှင်းလို့ရမလား။',
    timestamp: '15 mins ago',
    status: 'unread',
    sentiment: 'question',
    orderIntent: true,
    suggestedReplyMyanmar: 'မင်္ဂလာပါ ကိုအောင်ကျော်ခင်ဗျာ။ Lipstick Shade #04 ပစ္စည်း ready stock ရှိပါသေးတယ်ခင်ဗျာ။ KPay, WavePay ဖြင့် အဆင်ပြေစွာ ငွေလွှဲပေးချေနိုင်ပါတယ်ခင်ဗျာ။',
    suggestedReplyEnglish: 'Hello Ko Aung Kyaw! Lipstick Shade #04 is in stock right now. We accept both KPay and WavePay for easy checkout.'
  },
  {
    id: 'msg_03',
    customerName: 'Su Myat Noe',
    platform: 'instagram',
    message: 'Acne prone skin အတွက် သင့်တော်တဲ့ Sunscreen လေး ညွှန်းပေးပါဦးရှင်။',
    timestamp: '42 mins ago',
    status: 'replied',
    sentiment: 'neutral',
    orderIntent: false,
    suggestedReplyMyanmar: 'မင်္ဂလာပါ မဆုမြတ်နိုးရှင့်။ ဝက်ခြံထွက်လွယ်တဲ့ အသားအရေအတွက်ဆိုရင် အဆီပြန်ခြင်းမရှိတဲ့ Pinkku Mineral Matte Sunscreen SPF50+ လေး အထူးသင့်တော်ပါတယ်ရှင်။ ချွေးပေါက်မပိတ်စေပါဘူးရှင်။',
    suggestedReplyEnglish: 'Hello Su Myat Noe! For acne-prone skin, we highly recommend our lightweight Pinkku Mineral Matte Sunscreen SPF50+ which is non-comedogenic and oil-free.'
  },
  {
    id: 'msg_05',
    customerName: 'Zin Ko Ko',
    platform: 'tiktok',
    message: 'ဒီဗီဒီယိုထဲက Rose Water Mist ဈေးနှုန်း ဘယ်လောက်လဲရှင့်၊ Comment ကနေ order တင်လို့ရလား။',
    timestamp: '20 mins ago',
    status: 'unread',
    sentiment: 'question',
    orderIntent: true,
    suggestedReplyMyanmar: 'မင်္ဂလာပါ ကိုဇင်ကိုကိုခင်ဗျာ။ Rose Water Mist ဈေးနှုန်းက ၁၅,၀၀၀ ကျပ်ပါ။ Comment ကနေ တိုက်ရိုက် order မတင်ပေးနိုင်သေးလို့ Inbox လေးပို့ပေးပါခင်ဗျာ၊ အသေးစိတ်ကူညီပေးပါမယ်။',
    suggestedReplyEnglish: 'Hello Zin Ko Ko! The Rose Water Mist is 15,000 kyats. We can\'t take orders directly from comments yet, so please send us a DM and we\'ll help you place the order there.'
  },
  {
    id: 'msg_04',
    customerName: 'Daw Khin Thida',
    platform: 'gmail',
    message: 'Wholesale inquiry for Mandalay branch distribution. Please send latest wholesale price catalog.',
    timestamp: '1 hour ago',
    status: 'unread',
    sentiment: 'urgent',
    orderIntent: true,
    suggestedReplyMyanmar: 'လေးစားရပါသော ဒေါ်ခင်သီတာရှင့်။ မန္တလေးမြို့ လက်ကားဖြန့်ချိရေးအတွက် စိတ်ဝင်စားမှုအပေါ် ကျေးဇူးတင်ရှိပါသည်။ ကျွန်မတို့၏ ၂၀၂၆ နောက်ဆုံးပေါ် လက်ကားဈေးနှုန်းကတ်တလောက်နှင့် အထူးလျှော့စျေးအစီအစဉ်များကို တွဲလျက် ပေးပို့အပ်ပါသည်ရှင်။',
    suggestedReplyEnglish: 'Dear Daw Khin Thida, thank you for your wholesale interest in distributing in Mandalay. We have attached our latest 2026 wholesale catalog and pricing tier.'
  }
];

export const initialAIAgents: AIAgent[] = [
  {
    id: 'agent_social_strategist',
    name: 'Moe Moe (Content Planner)',
    role: 'Social Media & Caption AI',
    description: 'Generates viral captions, hashtags, and schedule suggestions tailored for Myanmar Facebook, TikTok, and Instagram audiences.',
    avatar: '👩‍💼',
    status: 'active',
    specialty: 'Myanmar Marketing Copy & TikTok Scripting',
    tasksCompleted: 412,
    accuracy: '98.5%'
  },
  {
    id: 'agent_customer_rep',
    name: 'Thiri (Sales & CS Bot)',
    role: '24/7 Customer Care & Order Taker',
    description: 'Reads customer DMs across Facebook, Telegram & TikTok, understands Burmese slang & Zawgyi/Unicode, and drafts instant professional replies.',
    avatar: '🌸',
    status: 'active',
    specialty: 'Customer Engagement & Fast Closing',
    tasksCompleted: 1280,
    accuracy: '99.2%'
  },
  {
    id: 'agent_email_manager',
    name: 'Ko Min (Gmail AI Executive)',
    role: 'Business & Supplier Inbox Assistant',
    description: 'Categorizes incoming supplier emails, invoices, partnership inquiries, and drafts formal bilingual responses.',
    avatar: '👨‍💻',
    status: 'active',
    specialty: 'B2B Correspondence & Order Tracking',
    tasksCompleted: 195,
    accuracy: '97.8%'
  },
  {
    id: 'agent_analytics_guru',
    name: 'Data Spider (Growth Analyst)',
    role: 'Cross-Platform Intelligence',
    description: 'Tracks engagement spikes, best posting times, top selling items, and ad spend efficiency.',
    avatar: '🕷️',
    status: 'active',
    specialty: 'ROI Analysis & Audience Demographics',
    tasksCompleted: 340,
    accuracy: '99.0%'
  }
];
