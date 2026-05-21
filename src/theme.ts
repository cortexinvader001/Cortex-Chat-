import { AppTheme } from './types';

export interface ThemeConfig {
  name: string;
  bgApp: string;       // Web body backdrop
  bgSidebar: string;   // Sidebar card / pane backdrop
  bgActiveChat: string;// Chat center surface
  bgBubbleSelf: string;// Own bubble
  bgBubbleOther: string;// Recipient bubble
  accentHex: string;   // Hex color for inline styles or icons
  accentClass: string; // Standard Tailwind bg accent
  textAccent: string;  // Standard Tailwind text accent
  borderAccent: string;// Standard Tailwind border accent
  badgeBg: string;     // Notifications metric count
  glowClass: string;   // Visual theme depth shadow
}

export const THEMES: Record<AppTheme, ThemeConfig> = {
  'dark-white': {
    name: 'Dark Theme (White)',
    bgApp: 'bg-[#0b141a]',
    bgSidebar: 'bg-[#121b22]',
    bgActiveChat: 'bg-[#0b141a]',
    bgBubbleSelf: 'bg-[#2a3942]',
    bgBubbleOther: 'bg-[#202c33]',
    accentHex: '#f8fafc',
    accentClass: 'bg-slate-200 text-slate-900',
    textAccent: 'text-white',
    borderAccent: 'border-slate-400',
    badgeBg: 'bg-slate-200 text-slate-900',
    glowClass: 'shadow-[0_0_10px_rgba(248,250,252,0.15)]',
  },
  'dark-orange': {
    name: 'Dark Theme (Orange)',
    bgApp: 'bg-[#0b141a]',
    bgSidebar: 'bg-[#141211]',
    bgActiveChat: 'bg-[#0c0a09]',
    bgBubbleSelf: 'bg-[#3c2517]',
    bgBubbleOther: 'bg-[#201a18]',
    accentHex: '#f97316',
    accentClass: 'bg-orange-500 text-white',
    textAccent: 'text-orange-500',
    borderAccent: 'border-orange-500',
    badgeBg: 'bg-orange-600 text-white',
    glowClass: 'shadow-[0_0_10px_rgba(249,115,22,0.2)]',
  },
  'dark-blue': {
    name: 'Dark Theme (Blue)',
    bgApp: 'bg-[#0d1527]',
    bgSidebar: 'bg-[#11192e]',
    bgActiveChat: 'bg-[#0b1220]',
    bgBubbleSelf: 'bg-[#1d4ed8]',
    bgBubbleOther: 'bg-[#1e293b]',
    accentHex: '#3b82f6',
    accentClass: 'bg-blue-600 text-white',
    textAccent: 'text-blue-500',
    borderAccent: 'border-blue-500',
    badgeBg: 'bg-blue-600 text-white',
    glowClass: 'shadow-[0_0_10px_rgba(59,130,246,0.25)]',
  },
  'dark-green': {
    name: 'Dark Theme (Green)',
    bgApp: 'bg-[#0b141a]',
    bgSidebar: 'bg-[#111b21]',
    bgActiveChat: 'bg-[#0b141a]',
    bgBubbleSelf: 'bg-[#005c4b]',
    bgBubbleOther: 'bg-[#202c33]',
    accentHex: '#00a884',
    accentClass: 'bg-[#00a884] text-[#111b21]',
    textAccent: 'text-[#00a884]',
    borderAccent: 'border-[#00a884]',
    badgeBg: 'bg-[#00a884] text-[#111b21]',
    glowClass: 'shadow-[0_0_10px_rgba(0,168,132,0.2)]',
  },
  'dark-purple': {
    name: 'Dark Theme (Purple)',
    bgApp: 'bg-[#0f0c1b]',
    bgSidebar: 'bg-[#151126]',
    bgActiveChat: 'bg-[#0d091a]',
    bgBubbleSelf: 'bg-[#581c87]',
    bgBubbleOther: 'bg-[#1e142b]',
    accentHex: '#a855f7',
    accentClass: 'bg-purple-600 text-white',
    textAccent: 'text-purple-500',
    borderAccent: 'border-purple-500',
    badgeBg: 'bg-purple-600 text-white',
    glowClass: 'shadow-[0_0_10px_rgba(168,85,247,0.25)]',
  }
};
