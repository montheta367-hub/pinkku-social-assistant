export type PlatformType = 'facebook' | 'instagram' | 'tiktok' | 'telegram' | 'gmail';

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
  businessName: string;
  businessType: string;
  isLoggedIn: boolean;
  tier?: 'free' | 'pro' | 'enterprise';
  connectedPlatforms?: PlatformType[];
}

export interface PlatformConnection {
  id: PlatformType;
  name: string;
  category: 'social' | 'messaging' | 'email';
  icon: string;
  connected: boolean;
  accountName?: string;
  handle?: string;
  followerCount?: number;
  lastSynced?: string;
  unreadCount?: number;
  color: string;
  badgeBg: string;
}

export interface SocialPost {
  id: string;
  title: string;
  content: string;
  myanmarContent?: string;
  platforms: PlatformType[];
  scheduledDate?: string;
  scheduledTime?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  likes?: number;
  comments?: number;
  shares?: number;
  reach?: number;
  mediaUrl?: string;
  tone?: string;
  tags?: string[];
  createdAt: string;
}

export interface CustomerMessage {
  id: string;
  customerName: string;
  customerAvatar?: string;
  platform: PlatformType;
  message: string;
  timestamp: string;
  status: 'unread' | 'replied' | 'pending';
  sentiment?: 'positive' | 'neutral' | 'question' | 'urgent';
  suggestedReplyMyanmar?: string;
  suggestedReplyEnglish?: string;
  orderIntent?: boolean;
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar: string;
  status: 'active' | 'standby' | 'working';
  specialty: string;
  tasksCompleted: number;
  accuracy: string;
}

export interface AnalyticsMetric {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtext: string;
}
