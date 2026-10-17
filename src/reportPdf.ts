import jsPDF from 'jspdf';

export interface ReportSummary {
  period: { since: string; days: number; platform: string };
  posts: {
    published: number;
    failed: number;
    pending: number;
    byPlatform: Record<string, { published: number; failed: number; pending: number }>;
  };
  messages: {
    total: number;
    replied: number;
    replyRate: number;
    byPlatform: { telegram: number; facebook: number };
  };
  orders: { total: number; fulfilled: number; new: number };
}

export interface ReportInsight {
  title: string;
  description: string;
}

export interface EngagementData {
  available: boolean;
  postsCounted?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const PINK: [number, number, number] = [255, 45, 133];
const DARK: [number, number, number] = [15, 15, 25];
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_500: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];
const EMERALD: [number, number, number] = [5, 150, 105];
const ROSE: [number, number, number] = [225, 29, 72];

function sectionHeader(doc: jsPDF, x: number, y: number, label: string, headline: string, contentW: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PINK);
  doc.text(label, x, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...SLATE_900);
  const lines = doc.splitTextToSize(headline, contentW - 10);
  doc.text(lines, x, y + 20);
}

// Builds a multi-page PDF entirely from real account data (the same
// numbers shown on screen) — no fabricated reach/engagement/view counts.
// Sections the mockup had but Pinkku doesn't track (per-post engagement,
// audience activity, likes/comments/shares) are simply left out rather
// than invented.
export function generateReportPdf(data: ReportSummary, insights: ReportInsight[], businessName: string, engagement?: EngagementData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  const todayLabel = formatDate(new Date().toISOString());

  // ---------- Page 1: Cover ----------
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setFillColor(...PINK);
  doc.circle(margin + 3, 28, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Pinkku Social Assistant', margin + 10, 29.5);

  doc.setFontSize(32);
  const titleLines = doc.splitTextToSize('Social Media Performance Report', contentW - 10);
  doc.text(titleLines, margin, 70);

  doc.setDrawColor(70, 70, 85);
  doc.line(margin, pageH - 40, pageW - margin, pageH - 40);

  const platformLabel = data.period.platform === 'all'
    ? 'All Platforms'
    : data.period.platform.charAt(0).toUpperCase() + data.period.platform.slice(1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`${platformLabel} · ${businessName}`, margin, pageH - 28);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SLATE_400);
  const periodText = `${formatDate(data.period.since)} - ${todayLabel}`;
  const periodW = doc.getTextWidth(periodText);
  doc.text(periodText, pageW - margin - periodW, pageH - 28);

  // ---------- Page 2: Performance Overview ----------
  doc.addPage();
  let y = margin;
  sectionHeader(doc, margin, y, '01 / PERFORMANCE OVERVIEW', 'A look at your real performance.', contentW);
  y += 36;
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  const stats = [
    { label: 'Posts Published', value: String(data.posts.published), sub: data.posts.failed > 0 ? `${data.posts.failed} failed` : null },
    { label: 'Customer Messages', value: String(data.messages.total), sub: `Telegram ${data.messages.byPlatform.telegram} · Facebook ${data.messages.byPlatform.facebook}` },
    { label: 'Reply Rate', value: `${data.messages.replyRate}%`, sub: `${data.messages.replied} of ${data.messages.total} replied` },
    { label: 'Orders Captured', value: String(data.orders.total), sub: `${data.orders.fulfilled} fulfilled · ${data.orders.new} new` },
  ];
  const colW = contentW / 2;
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * colW;
    const sy = y + row * 26;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_500);
    doc.text(s.label, x, sy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...SLATE_900);
    doc.text(s.value, x, sy + 9);
    if (s.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_500);
      doc.text(s.sub, x, sy + 15);
    }
  });
  y += 2 * 26 + 10;

  const channelRows = [
    { key: 'Telegram', count: data.messages.byPlatform.telegram },
    { key: 'Facebook', count: data.messages.byPlatform.facebook },
  ].filter(r => r.count > 0);
  if (channelRows.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...SLATE_900);
    doc.text('Messages by Channel', margin, y);
    y += 8;
    const maxCount = Math.max(...channelRows.map(r => r.count), 1);
    const barMaxW = contentW - 40;
    channelRows.forEach((r) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_500);
      doc.text(r.key, margin, y + 4);
      const barW = Math.max((r.count / maxCount) * barMaxW, 4);
      doc.setFillColor(...BORDER);
      doc.roundedRect(margin + 28, y, barMaxW, 5, 2, 2, 'F');
      doc.setFillColor(...PINK);
      doc.roundedRect(margin + 28, y, barW, 5, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...SLATE_900);
      doc.text(String(r.count), margin + 28 + barMaxW + 4, y + 4);
      y += 10;
    });
  }

  if (engagement?.available) {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...SLATE_900);
    doc.text('Facebook Engagement (real-time)', margin, y);
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text(`Live from Facebook · based on your ${engagement.postsCounted} most recently published posts`, margin, y + 5);
    y += 13;

    const engStats = [
      { label: 'Likes', value: String(engagement.totalLikes ?? 0) },
      { label: 'Comments', value: String(engagement.totalComments ?? 0) },
      { label: 'Shares', value: String(engagement.totalShares ?? 0) },
    ];
    const engColW = contentW / 3;
    engStats.forEach((s, i) => {
      const x = margin + i * engColW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_500);
      doc.text(s.label, x, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...SLATE_900);
      doc.text(s.value, x, y + 9);
    });
  }

  // ---------- Page 3: Publishing by Channel ----------
  doc.addPage();
  y = margin;
  sectionHeader(doc, margin, y, '02 / PUBLISHING BY CHANNEL', 'Where your content went out.', contentW);
  y += 36;
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  const platforms = Object.keys(data.posts.byPlatform);
  if (platforms.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_500);
    doc.text('No posts published yet in this period.', margin, y + 4);
  } else {
    platforms.forEach((p) => {
      const stats2 = data.posts.byPlatform[p];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...SLATE_900);
      doc.text(p.charAt(0).toUpperCase() + p.slice(1), margin, y + 5);

      let detailX = pageW - margin;
      const parts: { label: string; value: string; color: [number, number, number] }[] = [
        { label: 'Published', value: String(stats2.published), color: EMERALD },
      ];
      if (stats2.failed > 0) parts.push({ label: 'Failed', value: String(stats2.failed), color: ROSE });
      if (stats2.pending > 0) parts.push({ label: 'Pending', value: String(stats2.pending), color: SLATE_500 });

      [...parts].reverse().forEach((part) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...part.color);
        const vw = doc.getTextWidth(part.value);
        detailX -= vw;
        doc.text(part.value, detailX, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...SLATE_400);
        const lw = doc.getTextWidth(part.label + '  ');
        detailX -= lw;
        doc.text(part.label, detailX, y + 5);
        detailX -= 6;
      });

      y += 8;
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y, pageW - margin, y);
      y += 8;
    });
  }

  // ---------- Page 4: AI Insights ----------
  if (insights.length > 0) {
    doc.addPage();
    y = margin;
    sectionHeader(doc, margin, y, '03 / PINKKU AI LEARNING', 'What your numbers are telling you.', contentW);
    y += 36;
    doc.setDrawColor(...BORDER);
    doc.line(margin, y, pageW - margin, y);
    y += 10;

    insights.forEach((insight, i) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...PINK);
      doc.text(String(i + 1).padStart(2, '0'), margin, y + 4);

      doc.setTextColor(...SLATE_900);
      doc.text(insight.title, margin + 12, y + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_500);
      const descLines = doc.splitTextToSize(insight.description, contentW - 12);
      doc.text(descLines, margin + 12, y + 10);

      y += 10 + descLines.length * 4.5 + 6;
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y, pageW - margin, y);
      y += 8;
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_400);
    doc.text('Generated by Pinkku AI from your real account data.', margin, pageH - margin);
  }

  doc.save(`pinkku-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
