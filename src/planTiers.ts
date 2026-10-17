// Shared plan/pricing definitions — used by the landing page's Packages
// section and the in-app Upgrade modal, so the two never drift apart.
export interface PlanTier {
  name: string;
  tagline: string;
  priceMonthly: number;
  users: string;
  popular: boolean;
  included: string[];
  excluded: string[];
}

export const PLAN_TIERS: PlanTier[] = [
  {
    name: 'Creator', tagline: 'For solo creators.', priceMonthly: 15000, users: '1 user', popular: false,
    included: ['Smart Publish', 'Smart Engage', 'Smart Report'],
    excluded: ['Smart Work', 'Downloadable reports'],
  },
  {
    name: 'Grower', tagline: 'For growing brands.', priceMonthly: 29000, users: '1 user', popular: false,
    included: ['Smart Publish', 'Smart Engage', 'Smart Report', 'Downloadable reports'],
    excluded: ['Smart Work'],
  },
  {
    name: 'Agency', tagline: 'For collaborative teams.', priceMonthly: 79000, users: '5 users', popular: true,
    included: ['Smart Publish', 'Smart Engage', 'Smart Work', 'Smart Report', 'Downloadable reports'],
    excluded: ['AI auto reply'],
  },
  {
    name: 'Corporate', tagline: 'For larger organizations.', priceMonthly: 149000, users: '10 users', popular: false,
    included: ['Smart Publish', 'Smart Engage', 'Smart Work', 'Smart Report', 'Downloadable reports', 'AI auto reply'],
    excluded: [],
  },
];
