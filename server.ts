import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { db } from './server-db';
import { Message } from './src/types';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Increase payload limit for base64 upload
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Set up server-side uploads folder for local fallback media storage
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded files statically at /uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// Create a Socket.io server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track current active socket sessions to map to user IDs
// userId -> socketId
const userSockets = new Map<string, string>();
// socketId -> userId
const socketUsers = new Map<string, string>();

/**
 * Parses and fetches metadata for link downloads (TikTok, YouTube, Facebook, Instagram, Twitter)
 */
async function fetchAutolinkMetadata(text: string): Promise<any | null> {
  if (!text) return null;
  const supportedPlatforms = {
    youtube: /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu\.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?/i,
    facebook: /(https?:\/\/)?((?:www|m|web)\.)?(facebook|fb)\.(com|watch)\/\S+/i,
    instagram: /(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(?:p|reel)\/([A-Za-z0-9\-_]+)/i,
    tiktok: /(https?:\/\/)?((?:www|m|vm|vt)\.)?tiktok\.com\/\S+/i,
    twitter: /(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/i
  };

  for (const [platform, regex] of Object.entries(supportedPlatforms)) {
    const match = text.match(regex);
    if (match) {
      const matchedUrl = match[0];
      try {
        const axios = (await import('axios')).default;
        console.log(`[Autolink] Detected ${platform} url match:`, matchedUrl);
        const encodedUrl = encodeURIComponent(matchedUrl);
        const res = await axios.get(`https://dev-priyanshi.onrender.com/api/alldl?url=${encodedUrl}`, {
          timeout: 4500,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        if (res.data && res.data.status && res.data.data) {
          const apiData = res.data.data;
          const dlUrl = apiData.high || apiData.low || matchedUrl;
          return {
            platform,
            title: apiData.title || `Media from ${platform.toUpperCase()}`,
            originalUrl: matchedUrl,
            downloadUrl: dlUrl,
            thumbnail: apiData.thumbnail || undefined,
            quality: apiData.high ? 'High' : 'Low'
          };
        }
      } catch (err: any) {
        console.warn(`[Autolink Error] Fallback triggered: ${err.message}`);
      }

      // Predefined visual fallback thumbnails so user has exquisite visual widgets on link detection
      let fallbackThumb = "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=400";
      if (platform === 'youtube') fallbackThumb = "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=400";
      else if (platform === 'instagram') fallbackThumb = "https://images.unsplash.com/photo-1611224885990-ab7363d1f2a9?q=80&w=400";
      else if (platform === 'tiktok') fallbackThumb = "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=400";

      return {
        platform,
        title: `Auto-Extracted Match on ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
        originalUrl: matchedUrl,
        downloadUrl: matchedUrl,
        thumbnail: fallbackThumb,
        quality: "High Quality"
      };
    }
  }
  return null;
}

/**
 * Helper to call Pollinations AI API and return response
 */
async function generateAIResponse(prompt: string, lastMessagesContext: Array<{ role: 'user' | 'assistant'; content: string }>) {
  try {
    const formattedMessages = [
      {
        role: 'system',
        content: `You are an integrated AI assistant inside a WhatsApp-like Chat Application clone.
State your answers concisely and professionally. Keep them brief because they will be read in a chat environment on mobile or browser.
Use standard formatting and keep answers under 2-3 paragraphs max. Respond directly to the user.`
      },
      ...lastMessagesContext,
      { role: 'user', content: prompt }
    ];

    console.log('[AI] Calling Pollinations AI with prompt:', prompt);
    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: formattedMessages,
        code: 'beast' // enables reliable speedy mode on pollinations
      })
    });

    if (!response.ok) {
      throw new Error(`Pollinations API returned status: ${response.status}`);
    }

    const text = await response.text();
    return text || "Sorry, I couldn't generate a response.";
  } catch (err) {
    console.error('[AI Error] Pollinations AI failed. Falling back to Gemini...', err);
    // Silent fallback to Gemini API if the developer supplied GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const contextStr = lastMessagesContext.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `${contextStr}\nUser: ${prompt}\nAI Assistant:`,
        });
        return result.text || "Sorry, I could not process your query currently.";
      } catch (gemErr) {
        console.error('[AI Error] Gemini fallback failed as well:', gemErr);
      }
    }
    return "I am currently offline. Please check your internet connectivity or try again.";
  }
}

// Clean up expired messages every 45 seconds & notify clients
setInterval(async () => {
  try {
    const deletedIds = await db.cleanupExpiredMessages();
    if (deletedIds.length > 0) {
      console.log(`[Interval] Broadcating deletion of ${deletedIds.length} expired messages to all sockets.`);
      io.emit('messages_expired', { messageIds: deletedIds });
    }
  } catch (e) {
    console.error('Error in interval cleanup: ', e);
  }
}, 45000);

// API Routes
app.post('/api/register', async (req, res) => {
  const { username, password, avatar, theme, bio } = req.body;
  if (!username || !password || !avatar) {
    return res.status(400).json({ error: 'Username, password, and avatar are required' });
  }

  try {
    const user = await db.registerUser(username, password, avatar, theme, bio);
    if (!user) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    // Return token (for MVP, we use the user's ID as token)
    return res.json({ token: user.id, user });
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ error: 'Database and registration failure' });
  }
});

// Friends Management Requests endpoints
app.post('/api/friends/request', authenticateToken, async (req: any, res) => {
  const { targetUsername } = req.body;
  if (!targetUsername) return res.status(400).json({ error: 'Target username is required' });

  try {
    const result = await db.sendFriendRequest(req.user.id, targetUsername);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Broadcast update of friend requests to target if online
    const allUsers = await db.getAllUsers();
    const targetObj = allUsers.find(u => u.username === targetUsername.trim().toLowerCase());
    if (targetObj) {
      const sockId = userSockets.get(targetObj.id);
      if (sockId) {
        const freshTarget = await db.getUser(targetObj.id);
        io.to(sockId).emit('friend_requests_updated', { friendRequests: freshTarget?.friendRequests || [] });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Friend request handler failed' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req: any, res) => {
  const { fromUserId } = req.body;
  if (!fromUserId) return res.status(400).json({ error: 'fromUserId is required' });

  try {
    const result = await db.acceptFriendRequest(req.user.id, fromUserId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const selfFresh = await db.getUser(req.user.id);
    const senderFresh = await db.getUser(fromUserId);

    const selfSock = userSockets.get(req.user.id);
    if (selfSock) {
      io.to(selfSock).emit('profile_updated', { user: selfFresh });
    }

    const senderSock = userSockets.get(fromUserId);
    if (senderSock) {
      io.to(senderSock).emit('profile_updated', { user: senderFresh });
    }

    res.json({ success: true, user: selfFresh });
  } catch (err) {
    res.status(500).json({ error: 'Accepting friend request failed' });
  }
});

app.post('/api/friends/decline', authenticateToken, async (req: any, res) => {
  const { fromUserId } = req.body;
  if (!fromUserId) return res.status(400).json({ error: 'fromUserId is required' });

  try {
    const result = await db.declineFriendRequest(req.user.id, fromUserId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const selfFresh = await db.getUser(req.user.id);
    const selfSock = userSockets.get(req.user.id);
    if (selfSock) {
      io.to(selfSock).emit('profile_updated', { user: selfFresh });
    }

    res.json({ success: true, user: selfFresh });
  } catch (err) {
    res.status(500).json({ error: 'Declining friend request failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await db.loginUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    return res.json({ token: user.id, user });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'Server authentication failure' });
  }
});

// Middleware to authorize user using simplistic token
async function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });
  
  const token = authHeader.replace('Bearer ', '').trim();
  const user = await db.getUser(token);
  if (!user) return res.status(403).json({ error: 'Invalid session token' });
  
  req.user = user;
  next();
}

app.get('/api/me', authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

function isDevUser(username: string): boolean {
  if (!username) return false;
  const cleanUsername = username.trim().toLowerCase();
  return cleanUsername === 'cortex' ||
         cleanUsername.includes('cortex') ||
         cleanUsername === 'developer' ||
         cleanUsername === 'admin' ||
         cleanUsername === 'dev';
}

app.get('/api/admin/stats', authenticateToken, async (req: any, res) => {
  if (!isDevUser(req.user.username)) {
    return res.status(403).json({ error: 'Administrative privilege required' });
  }
  try {
    const allUsers = await db.getAllUsers();
    const allChats = await db.adminGetAllChats();
    res.json({
      stats: {
        totalUsers: allUsers.length,
        totalChats: allChats.length,
        onlineUsersCount: allUsers.filter(u => u.isOnline).length,
        groupChatsCount: allChats.filter(c => c.isGroup).length,
        directChatsCount: allChats.filter(c => !c.isGroup).length
      },
      users: allUsers,
      chats: allChats
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compile stats' });
  }
});

app.delete('/api/admin/users/:userId', authenticateToken, async (req: any, res) => {
  if (!isDevUser(req.user.username)) {
    return res.status(403).json({ error: 'Administrative privilege required' });
  }
  const { userId } = req.params;
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  try {
    const ok = await db.adminDeleteUser(userId);
    if (!ok) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.delete('/api/admin/chats/:chatId', authenticateToken, async (req: any, res) => {
  if (!isDevUser(req.user.username)) {
    return res.status(403).json({ error: 'Administrative privilege required' });
  }
  const { chatId } = req.params;
  try {
    const ok = await db.adminDeleteChat(chatId);
    if (!ok) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

app.get('/api/users', authenticateToken, async (req: any, res) => {
  try {
    const all = await db.getAllUsers();
    // Filter out the calling user
    const rest = all.filter(u => u.id !== req.user.id);
    res.json({ users: rest });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve directory list' });
  }
});

app.put('/api/user/theme', authenticateToken, async (req: any, res) => {
  const { theme } = req.body;
  if (!theme) return res.status(400).json({ error: 'Theme selection required' });
  
  try {
    await db.updateUserTheme(req.user.id, theme);
    res.json({ success: true, theme });
  } catch (e) {
    res.status(500).json({ error: 'Theme persistence failed' });
  }
});

// Chats
app.get('/api/chats', authenticateToken, async (req: any, res) => {
  try {
    const chats = await db.getChatsForUser(req.user.id);
    res.json({ chats });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load conversation list' });
  }
});

app.post('/api/chats', authenticateToken, async (req: any, res) => {
  const { members, isGroup, name } = req.body;
  if (!members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'Conversational members list required' });
  }

  // Ensure calling user is included
  const chatMembers = Array.from(new Set([...members, req.user.id]));

  try {
    // If not group, check if a direct conversation already exists
    if (!isGroup) {
      const otherUserId = members.find((mId: string) => mId !== req.user.id);
      if (otherUserId) {
        const targetUser = await db.getUser(otherUserId);
        if (targetUser) {
          const isFriend = (targetUser.friends || []).includes(req.user.id);
          const isTargetPublic = targetUser.isPublic === true;
          if (!isFriend && !isTargetPublic) {
            return res.status(400).json({ 
              error: `@${targetUser.username}'s profile is private. You must send a friend invitation and have them accept you before you can DM them, or they must set their profile to public.` 
            });
          }
        }
      }

      const existingChats = await db.getChatsForUser(req.user.id);
      const dm = existingChats.find(c => !c.isGroup && c.members.length === 2 && chatMembers.every(m => c.members.includes(m)));
      if (dm) {
        return res.json({ chat: dm, alreadyExists: true });
      }
    }

    // Set the creatorId (req.user.id) as the 4th argument so they are set as Group Admin correctly!
    const chat = await db.createChat(chatMembers, isGroup, name, req.user.id);
    
    // Broadcast chat creation to other members
    chatMembers.forEach(mId => {
      const sockId = userSockets.get(mId);
      if (sockId) {
        io.to(sockId).emit('chat_created', { chat });
      }
    });

    res.json({ chat });
  } catch (e) {
    res.status(500).json({ error: 'An error occurred building the chat' });
  }
});

app.get('/api/chats/:chatId/messages', authenticateToken, async (req: any, res) => {
  const { chatId } = req.params;
  try {
    const messages = await db.getMessagesForChat(chatId);
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// STATUSES ENDPOINTS (Expires after 24 hours)
app.post('/api/statuses', authenticateToken, async (req: any, res) => {
  const { text, backgroundColor } = req.body;
  if (!text) return res.status(400).json({ error: 'Status text content is required' });

  try {
    const status = await db.createStatus(
      req.user.id,
      req.user.username,
      req.user.avatar,
      text.substring(0, 150), // Standard limit to keep statuses neat
      backgroundColor || 'bg-gradient-to-r from-teal-600 to-emerald-600'
    );
    // Broadcast status to everyone online
    io.emit('status_created', { status });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish text status' });
  }
});

app.get('/api/statuses', authenticateToken, async (req: any, res) => {
  try {
    const statuses = await db.getActiveStatuses();
    res.json({ statuses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve active statuses' });
  }
});

app.delete('/api/statuses/:statusId', authenticateToken, async (req: any, res) => {
  const { statusId } = req.params;
  try {
    const success = await db.deleteStatus(statusId, req.user.id);
    if (success) {
      // Broadcast delete to everyone online
      io.emit('status_deleted', { statusId });
      res.json({ success: true, statusId });
    } else {
      res.status(404).json({ error: 'Status not found or unauthorized' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete status' });
  }
});

// DISPATCH NEW MESSAGE VIA REST API (FOR STATUS REPLIES AND REMOTE INTERACTIONS)
app.post('/api/messages', authenticateToken, async (req: any, res) => {
  const { chatId, text, quotedMessageId, quotedMessageText, quotedSenderName, mediaUrl, mediaType } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId parameter is required' });

  try {
    const savedMessage = await db.storeMessage({
      chatId,
      senderId: req.user.id,
      senderName: req.user.username,
      senderAvatar: req.user.avatar || '👤',
      text: text || '',
      mediaUrl,
      mediaType,
      quotedMessageId,
      quotedMessageText,
      quotedSenderName
    } as any);

    io.to(chatId).emit('message_received', { message: savedMessage });
    res.json({ success: true, message: savedMessage });
  } catch (err) {
    console.error('Failed to dispatch REST message: ', err);
    res.status(500).json({ error: 'Failed to record the message' });
  }
});

// MESSAGE REACTION ENDPOINT
app.post('/api/messages/:messageId/reactions', authenticateToken, async (req: any, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji character required' });

  try {
    const updatedMessage = await db.addMessageReaction(messageId, req.user.id, emoji);
    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Broadcast update of reactions to everyone
    io.emit('message_reaction_updated', { message: updatedMessage });
    res.json({ success: true, message: updatedMessage });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit action reaction' });
  }
});

// GROUP MANAGEMENT ENDPOINTS
app.put('/api/chats/:chatId/admins', authenticateToken, async (req: any, res) => {
  const { chatId } = req.params;
  const { admins } = req.body;
  if (!admins || !Array.isArray(admins)) {
    return res.status(400).json({ error: 'Admins list must be an array of user IDs' });
  }

  try {
    // Check if user has membership and group admin privileges
    const chats = await db.getChatsForUser(req.user.id);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Conversation space not found' });
    if (!chat.isGroup) return res.status(400).json({ error: 'This conversation is not a group' });

    const isCallerAdmin = (chat.admins || []).includes(req.user.id);
    if (!isCallerAdmin) {
      return res.status(403).json({ error: 'Only group admins can add other group admins' });
    }

    const updated = await db.updateGroupAdmins(chatId, admins);
    if (!updated) return res.status(500).json({ error: 'Failed to update group admins' });

    io.to(chatId).emit('group_updated', { chat: updated });
    res.json({ success: true, chat: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error modifying group administrative roles' });
  }
});

app.delete('/api/chats/:chatId/members/:memberId', authenticateToken, async (req: any, res) => {
  const { chatId, memberId } = req.params;

  try {
    const chats = await db.getChatsForUser(req.user.id);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Conversation space not found' });
    if (!chat.isGroup) return res.status(400).json({ error: 'This conversation is not a group' });

    const isCallerAdmin = (chat.admins || []).includes(req.user.id);
    if (!isCallerAdmin) {
      return res.status(403).json({ error: 'Only group admins can remove members' });
    }

    if (memberId === req.user.id) {
      return res.status(400).json({ error: 'You are an admin. You cannot remove yourself from here' });
    }

    const updated = await db.removeGroupMember(chatId, memberId);
    if (!updated) return res.status(500).json({ error: 'Failed to remove user from group' });

    const targetSock = userSockets.get(memberId);
    if (targetSock) {
      io.to(targetSock).emit('group_member_removed', { chatId });
    }

    io.to(chatId).emit('group_updated', { chat: updated });
    res.json({ success: true, chat: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error removing user from group' });
  }
});

app.post('/api/chats/:chatId/members', authenticateToken, async (req: any, res) => {
  const { chatId } = req.params;
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'memberId is required' });

  try {
    const chats = await db.getChatsForUser(req.user.id);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Conversation space not found' });
    if (!chat.isGroup) return res.status(400).json({ error: 'This conversation is not a group' });

    if (!chat.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Must be current member of the group to add members' });
    }

    const updated = await db.addGroupMember(chatId, memberId);
    if (!updated) return res.status(500).json({ error: 'Failed to add member to group' });

    const targetSock = userSockets.get(memberId);
    if (targetSock) {
      const ioSocket = io.sockets.sockets.get(targetSock);
      if (ioSocket) {
        ioSocket.join(chatId);
      }
      io.to(targetSock).emit('chat_created', { chat: updated });
    }

    io.to(chatId).emit('group_updated', { chat: updated });
    res.json({ success: true, chat: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error adding member' });
  }
});

// USER PROFILE MANAGEMENT ENDPOINT
app.put('/api/user/profile', authenticateToken, async (req: any, res) => {
  const { bio, avatar, isPublic } = req.body;

  try {
    const updated = await db.updateUserProfile(req.user.id, { bio, avatar, isPublic });
    if (!updated) return res.status(404).json({ error: 'User not found' });

    io.emit('user_profile_updated', { user: updated });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Upload media: Base64 JSON parser fallback to handle Cloudinary
app.post('/api/upload', authenticateToken, async (req, res) => {
  const { filename, filetype, base64 } = req.body;
  if (!base64) {
    return res.status(400).json({ error: 'Base64 data representation required' });
  }

  try {
    // 1. Attempt Cloudinary upload if config is present
    if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET)) {
      console.log('[Upload] Detected Cloudinary settings. Attempting Cloudinary Upload...');
      // Build a standard direct post to Cloudinary's signature-free uploading endpoint
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL?.split('@')[1];
      const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'whatsapp_pwa_unsigned';
      
      const filePayload = base64.startsWith('data:') ? base64 : `data:${filetype};base64,${base64}`;

      try {
        const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: filePayload,
            upload_preset: uploadPreset,
            folder: 'whatsapp_mvp'
          })
        });

        if (cloudResponse.ok) {
          const cloudData = await cloudResponse.json();
          console.log('[Upload] Cloudinary upload successful:', cloudData.secure_url);
          return res.json({ url: cloudData.secure_url });
        } else {
          const errData = await cloudResponse.text();
          console.warn('[Upload] Cloudinary unsuccessful, falling back to local file. Detail:', errData);
        }
      } catch (cloudErr) {
        console.warn('[Upload] Cloudinary upload errored, resorting to local fallback:', cloudErr);
      }
    }

    // 2. Local fallback storage writing as guaranteed bypass
    const fileSuffix = Date.now() + '-' + Math.random().toString(36).substring(7);
    const cleanFilename = (filename || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
    const localFilename = `${fileSuffix}-${cleanFilename}`;
    const destinationPath = path.join(UPLOADS_DIR, localFilename);

    const base64Data = base64.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    fs.writeFileSync(destinationPath, base64Data, 'base64');

    const appUrl = process.env.APP_URL || '';
    const fileUrl = `/uploads/${localFilename}`;

    console.log('[Upload] Native local upload saved:', fileUrl);
    return res.json({ url: fileUrl });
  } catch (err) {
    console.error('Upload handler crashed', err);
    res.status(500).json({ error: 'Media write operation failed' });
  }
});

// Direct AI Assistant query endpoint for dedicated AI chat
app.post('/api/ai', authenticateToken, async (req: any, res) => {
  const { prompt, lastMessages } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt field required' });

  try {
    const messagesContext = (lastMessages || []).map((m: any) => ({
      role: m.senderId === 'ai_assistant' ? 'assistant' : 'user',
      content: m.text
    }));

    const reply = await generateAIResponse(prompt, messagesContext);
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'AI retrieval failed' });
  }
});

// Socket.io WebSockets event controller
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // When a user identifies themselves (joins)
  socket.on('register_session', async ({ userId }) => {
    if (!userId) return;
    
    // Map socket
    userSockets.set(userId, socket.id);
    socketUsers.set(socket.id, userId);

    // Set online
    await db.setUserOnlineStatus(userId, true);
    
    // Join active chat rooms
    const chats = await db.getChatsForUser(userId);
    chats.forEach(c => {
      socket.join(c.id);
      console.log(`[Socket] User ${userId} joined room/chat ${c.id}`);
    });

    // Broadcast online status to everyone
    io.emit('user_presence_change', { userId, isOnline: true });
    console.log(`[Socket] User ${userId} registry complete. Broadcating presence: Online.`);
  });

  // Client joining an individual group or private room specifically
  socket.on('join_room', ({ chatId }) => {
    socket.join(chatId);
    console.log(`[Socket] Client ${socket.id} joined specific room ${chatId}`);
  });

  // Client sending a message
  socket.on('send_message', async (newMsgPayload, callback) => {
    const { 
      chatId, 
      senderId, 
      senderName, 
      senderAvatar, 
      text, 
      mediaUrl, 
      mediaType,
      quotedMessageId,
      quotedMessageText,
      quotedSenderName
    } = newMsgPayload;
    if (!chatId || !senderId) {
      if (callback) callback({ error: 'Missing parameters' });
      return;
    }

    try {
      const autolinkMetadata = await fetchAutolinkMetadata(text);

      // Store message
      const savedMessage = await db.storeMessage({
        chatId,
        senderId,
        senderName,
        senderAvatar,
        text,
        mediaUrl,
        mediaType,
        autolink: autolinkMetadata || undefined,
        quotedMessageId,
        quotedMessageText,
        quotedSenderName
      } as any);

      console.log(`[Socket] Received msg in ${chatId} from ${senderName}: "${text}"`);
      
      // Emit back to room immediately
      io.to(chatId).emit('message_received', { message: savedMessage });
      if (callback) callback({ success: true, message: savedMessage });

      // Trigger automatic AI reply if mention "@ai" exists inside message text
      if (text && text.toLowerCase().includes('@ai')) {
        io.to(chatId).emit('ai_state_change', { isGenerating: true, chatId });

        // Build recent context of non-expired messages from this chat is useful
        const recentMessages = await db.getMessagesForChat(chatId);
        // Map to format
        const lastMsgsFormatted = recentMessages.slice(-8).map(m => ({
          role: (m.senderId === 'ai_assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.text
        }));

        // Clean user's explicit "@ai" from prompt to focus reply
        const cleanPrompt = text.replace(/@ai/gi, '').trim() || "Hello there!";

        // Generate response
        const aiResponseText = await generateAIResponse(cleanPrompt, lastMsgsFormatted);

        // Store prompt response
        const aiMessage = await db.storeMessage({
          chatId,
          senderId: 'ai_assistant',
          senderName: 'AI Assistant',
          senderAvatar: '🤖',
          text: aiResponseText
        });

        // Broadcast to space
        io.to(chatId).emit('message_received', { message: aiMessage });
        io.to(chatId).emit('ai_state_change', { isGenerating: false, chatId });
        console.log(`[Socket] AI finished generating response in room ${chatId}.`);
      }

    } catch (err) {
      console.error('Socket message handler errored', err);
      if (callback) callback({ error: 'Internal write error' });
    }
  });

  // Typing indicator
  socket.on('typing_state', ({ chatId, userId, isTyping, username }) => {
    socket.to(chatId).emit('user_typing_state', { chatId, userId, isTyping, username });
  });

  // Disconnection controller
  socket.on('disconnect', async () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const userId = socketUsers.get(socket.id);
    if (userId) {
      // Unlink
      userSockets.delete(userId);
      socketUsers.delete(socket.id);

      // Save database offline state
      await db.setUserOnlineStatus(userId, false);

      // Broadcast offline changes
      io.emit('user_presence_change', { userId, isOnline: false });
      console.log(`[Socket] User ${userId} offline logic synced.`);
    }
  });
});

// Vite client bundler vs Static compiled distribution routes
async function startWebapp() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Express] Vite Development middleware mounted.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Verify production dist exists
    if (!fs.existsSync(distPath)) {
      console.warn('Production /dist not built. Fallback to standard client directories.');
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Express] Serving static client build files from /dist.');
  }

  // Final Server Listen
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🟢 WHATSAPP-LIKE PWA APP STARTED CONVENIENTLY      `);
    console.log(`   Host: Localhost & Cloud Environment Port: ${PORT}`);
    console.log(`====================================================`);
  });
}

startWebapp();
