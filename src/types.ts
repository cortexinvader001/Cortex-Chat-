/**
 * Type declarations for our WhatsApp-like Chat App MVP
 */

export type AppTheme = 
  | 'dark-white'
  | 'dark-orange'
  | 'dark-blue'
  | 'dark-green'
  | 'dark-purple';

export interface User {
  id: string;
  username: string;
  avatar: string; // URL or emoji-based avatar representation
  theme: AppTheme;
  isOnline: boolean;
  bio?: string; // 20-character limit biography status
  isPublic?: boolean; // Can strangers DM me directly?
  friends?: string[]; // user IDs list
  friendRequests?: Array<{ fromId: string; fromUsername: string; fromAvatar: string }>;
  createdAt: string;
}

export interface Chat {
  id: string;
  name?: string; // Group chat name
  isGroup: boolean;
  members: string[]; // User IDs
  admins?: string[]; // Admin user IDs list
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface UserStatus {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  backgroundColor: string;
  createdAt: string; // ISO string
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'local' | null;
  autolink?: {
    platform: string;
    title: string;
    originalUrl: string;
    downloadUrl: string;
    thumbnail?: string;
    quality?: string;
  };
  createdAt: string; // ISO string
  expiresAt: string; // ISO string (createdAt + 2 days)
  reactions?: Record<string, string>; // user id -> emoji
  quotedMessageId?: string;
  quotedMessageText?: string;
  quotedSenderName?: string;
}

export interface AIResponseState {
  isGenerating: boolean;
  chatId?: string;
}

export const DEV_VERIFIED_USERNAMES = ['Cortex'];
