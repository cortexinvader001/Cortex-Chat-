import fs from 'fs';
import path from 'path';
import { MongoClient, Db } from 'mongodb';
import { User, Chat, Message, AppTheme, UserStatus } from './src/types';

// Simple password hashing/simulation helper for MVP
function hashPassword(pwd: string): string {
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    const char = pwd.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

interface LocalDB {
  users: Array<User & { passwordHash: string }>;
  chats: Chat[];
  messages: Message[];
  statuses: UserStatus[];
}

const DB_FILE = path.join(process.cwd(), 'app_db.json');

class DatabaseManager {
  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private useMongo = false;

  // Local file fallback DB memory state
  private localData: LocalDB = {
    users: [],
    chats: [],
    messages: [],
    statuses: []
  };

  constructor() {
    this.loadLocal();
    this.connectMongo();
  }

  private loadLocal() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.localData = JSON.parse(fileContent);
        // Ensure default arrays are present
        if (!this.localData.users) this.localData.users = [];
        if (!this.localData.chats) this.localData.chats = [];
        if (!this.localData.messages) this.localData.messages = [];
        if (!this.localData.statuses) this.localData.statuses = [];
      } else {
        this.saveLocal();
      }
    } catch (err) {
      console.error('Error reading local db.json, starting fresh', err);
    }
  }

  private saveLocal() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing local db.json', err);
    }
  }

  private async connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (uri) {
      console.log('Detected MONGODB_URI. Attempting to connect to MongoDB...', uri.split('@')[1] || uri);
      try {
        this.mongoClient = new MongoClient(uri);
        await this.mongoClient.connect();
        this.mongoDb = this.mongoClient.db('whatsapp_mvp');
        this.useMongo = true;
        console.log('Connected to MongoDB successfully!');
        
        // Populate local fallback database into MongoDB to migrate any existing mock/active data
        await this.migrateLocalToMongo();
      } catch (err) {
        console.error('MongoDB connection failed. Continuing with local JSON DB file fallback.', err);
        this.useMongo = false;
      }
    } else {
      console.log('No MONGODB_URI environment variable found. Using high-fidelity local JSON database (app_db.json).');
    }
  }

  private async migrateLocalToMongo() {
    if (!this.useMongo || !this.mongoDb) return;
    try {
      const userCount = await this.mongoDb.collection('users').countDocuments();
      if (userCount === 0 && this.localData.users.length > 0) {
        console.log('Migrating local users to MongoDB...');
        await this.mongoDb.collection('users').insertMany(this.localData.users);
      }
      const chatCount = await this.mongoDb.collection('chats').countDocuments();
      if (chatCount === 0 && this.localData.chats.length > 0) {
        console.log('Migrating local chats to MongoDB...');
        await this.mongoDb.collection('chats').insertMany(this.localData.chats);
      }
      const msgCount = await this.mongoDb.collection('messages').countDocuments();
      if (msgCount === 0 && this.localData.messages.length > 0) {
        console.log('Migrating local messages to MongoDB...');
        await this.mongoDb.collection('messages').insertMany(this.localData.messages);
      }
    } catch (e) {
      console.error('Migration error', e);
    }
  }

  // Users Auth APIs
  async registerUser(username: string, passwordPlain: string, avatar: string, theme: AppTheme = 'dark-blue', bio?: string): Promise<User | null> {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !passwordPlain) return null;
    const pwdHash = hashPassword(passwordPlain);
    const cleanBio = bio ? bio.trim().substring(0, 20) : 'Hey there! I use chat';

    if (this.useMongo && this.mongoDb) {
      const existing = await this.mongoDb.collection('users').findOne({ username: cleanUsername });
      if (existing) return null;
      
      const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
      const newUserDoc = {
        id: userId,
        username: cleanUsername,
        passwordHash: pwdHash,
        avatar,
        theme,
        isOnline: false,
        bio: cleanBio,
        isPublic: false,
        friends: [] as string[],
        friendRequests: [] as any[],
        createdAt: new Date().toISOString()
      };
      await this.mongoDb.collection('users').insertOne(newUserDoc);
      const { passwordHash, ...userObj } = newUserDoc;
      return userObj as User;
    } else {
      const existing = this.localData.users.find(u => u.username === cleanUsername);
      if (existing) return null;

      const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
      const newUser = {
        id: userId,
        username: cleanUsername,
        passwordHash: pwdHash,
        avatar,
        theme,
        isOnline: false,
        bio: cleanBio,
        isPublic: false,
        friends: [] as string[],
        friendRequests: [] as any[],
        createdAt: new Date().toISOString()
      };
      this.localData.users.push(newUser);
      this.saveLocal();

      const { passwordHash, ...userObj } = newUser;
      return userObj as User;
    }
  }

  async loginUser(username: string, passwordPlain: string): Promise<User | null> {
    const cleanUsername = username.trim().toLowerCase();
    const pwdHash = hashPassword(passwordPlain);

    if (this.useMongo && this.mongoDb) {
      const userDoc = await this.mongoDb.collection('users').findOne({ username: cleanUsername, passwordHash: pwdHash });
      if (!userDoc) return null;
      const { _id, passwordHash, ...userObj } = userDoc as any;
      return {
        ...userObj,
        bio: userObj.bio || 'Hey there! I use chat',
        friends: userObj.friends || [],
        friendRequests: userObj.friendRequests || []
      } as User;
    } else {
      const user = this.localData.users.find(u => u.username === cleanUsername && u.passwordHash === pwdHash);
      if (!user) return null;
      const { passwordHash, ...userObj } = user;
      return {
        ...userObj,
        bio: userObj.bio || 'Hey there! I use chat',
        friends: userObj.friends || [],
        friendRequests: userObj.friendRequests || []
      } as User;
    }
  }

  async getUser(userId: string): Promise<User | null> {
    if (this.useMongo && this.mongoDb) {
      const userDoc = await this.mongoDb.collection('users').findOne({ id: userId });
      if (!userDoc) return null;
      const { _id, passwordHash, ...userObj } = userDoc as any;
      return {
        ...userObj,
        bio: userObj.bio || 'Hey there! I use chat',
        friends: userObj.friends || [],
        friendRequests: userObj.friendRequests || []
      } as User;
    } else {
      const user = this.localData.users.find(u => u.id === userId);
      if (!user) return null;
      const { passwordHash, ...userObj } = user;
      return {
        ...userObj,
        bio: userObj.bio || 'Hey there! I use chat',
        friends: userObj.friends || [],
        friendRequests: userObj.friendRequests || []
      } as User;
    }
  }

  async updateUserTheme(userId: string, theme: AppTheme): Promise<boolean> {
    if (this.useMongo && this.mongoDb) {
      const result = await this.mongoDb.collection('users').updateOne({ id: userId }, { $set: { theme } });
      return result.modifiedCount > 0;
    } else {
      const user = this.localData.users.find(u => u.id === userId);
      if (user) {
        user.theme = theme;
        this.saveLocal();
        return true;
      }
      return false;
    }
  }

  async setUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('users').updateOne({ id: userId }, { $set: { isOnline } });
    } else {
      const user = this.localData.users.find(u => u.id === userId);
      if (user) {
        user.isOnline = isOnline;
        this.saveLocal();
      }
    }
  }

  async getAllUsers(): Promise<User[]> {
    if (this.useMongo && this.mongoDb) {
      const cursor = this.mongoDb.collection('users').find();
      const docs = await cursor.toArray();
      return docs.map((d: any) => {
        const { _id, passwordHash, ...userObj } = d;
        return {
          ...userObj,
          bio: userObj.bio || 'Hey there! I use chat',
          friends: userObj.friends || [],
          friendRequests: userObj.friendRequests || []
        } as User;
      });
    } else {
      return this.localData.users.map(u => {
        const { passwordHash, ...userObj } = u;
        return {
          ...userObj,
          bio: userObj.bio || 'Hey there! I use chat',
          friends: userObj.friends || [],
          friendRequests: userObj.friendRequests || []
        } as User;
      });
    }
  }

  async sendFriendRequest(fromUserId: string, toUsername: string): Promise<{ success: boolean; error?: string }> {
    const sender = await this.getUser(fromUserId);
    if (!sender) return { success: false, error: 'Sender not found' };

    const targetUsernameClean = toUsername.trim().toLowerCase();
    if (sender.username === targetUsernameClean) {
      return { success: false, error: 'You cannot send a friend request to yourself' };
    }

    let target: any = null;
    if (this.useMongo && this.mongoDb) {
      target = await this.mongoDb.collection('users').findOne({ username: targetUsernameClean });
    } else {
      target = this.localData.users.find(u => u.username === targetUsernameClean);
    }

    if (!target) return { success: false, error: `User with username "${toUsername}" not found` };

    const targetFriends = target.friends || [];
    if (targetFriends.includes(fromUserId)) {
      return { success: false, error: 'You are already friends' };
    }

    const targetRequests = target.friendRequests || [];
    if (targetRequests.some((r: any) => r.fromId === fromUserId)) {
      return { success: false, error: 'Friend request was already sent' };
    }

    const newRequest = {
      fromId: fromUserId,
      fromUsername: sender.username,
      fromAvatar: sender.avatar
    };

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('users').updateOne(
        { id: target.id },
        { $push: { friendRequests: newRequest } } as any
      );
    } else {
      if (!target.friendRequests) target.friendRequests = [];
      target.friendRequests.push(newRequest);
      this.saveLocal();
    }

    return { success: true };
  }

  async acceptFriendRequest(userId: string, fromUserId: string): Promise<{ success: boolean; error?: string }> {
    const self = await this.getUser(userId);
    const sender = await this.getUser(fromUserId);
    if (!self || !sender) return { success: false, error: 'User profiles not found' };

    const updatedRequests = (self.friendRequests || []).filter((r: any) => r.fromId !== fromUserId);
    const selfFriends = Array.from(new Set([...(self.friends || []), fromUserId]));
    const senderFriends = Array.from(new Set([...(sender.friends || []), userId]));

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('users').updateOne(
        { id: userId },
        { $set: { friendRequests: updatedRequests, friends: selfFriends } }
      );
      await this.mongoDb.collection('users').updateOne(
        { id: fromUserId },
        { $set: { friends: senderFriends } }
      );
    } else {
      const selfRaw = this.localData.users.find(u => u.id === userId);
      const senderRaw = this.localData.users.find(u => u.id === fromUserId);
      if (selfRaw) {
        selfRaw.friendRequests = updatedRequests;
        selfRaw.friends = selfFriends;
      }
      if (senderRaw) {
        senderRaw.friends = senderFriends;
      }
      this.saveLocal();
    }

    return { success: true };
  }

  async declineFriendRequest(userId: string, fromUserId: string): Promise<{ success: boolean; error?: string }> {
    const self = await this.getUser(userId);
    if (!self) return { success: false, error: 'User profile not found' };

    const updatedRequests = (self.friendRequests || []).filter((r: any) => r.fromId !== fromUserId);

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('users').updateOne(
        { id: userId },
        { $set: { friendRequests: updatedRequests } }
      );
    } else {
      const selfRaw = this.localData.users.find(u => u.id === userId);
      if (selfRaw) {
        selfRaw.friendRequests = updatedRequests;
      }
      this.saveLocal();
    }

    return { success: true };
  }

  // Chats APIs
  async getChatsForUser(userId: string): Promise<Chat[]> {
    if (this.useMongo && this.mongoDb) {
      const cursor = this.mongoDb.collection('chats').find({ members: userId });
      const docs = await cursor.toArray();
      return docs.map((d: any) => {
        const { _id, ...chatObj } = d;
        return chatObj as Chat;
      });
    } else {
      return this.localData.chats.filter(c => c.members.includes(userId));
    }
  }

  async createChat(members: string[], isGroup: boolean, name?: string, creatorId?: string): Promise<Chat> {
    const chatId = 'cht_' + Math.random().toString(36).substr(2, 9);
    const primaryAdmin = creatorId || members[0] || '';
    const newChat: Chat = {
      id: chatId,
      name: isGroup ? (name || 'Group Chat') : undefined,
      isGroup,
      members,
      admins: isGroup ? [primaryAdmin] : undefined,
      createdAt: new Date().toISOString()
    };

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('chats').insertOne({ ...newChat });
    } else {
      this.localData.chats.push(newChat);
      this.saveLocal();
    }
    return newChat;
  }

  // Messages APIs
  async getMessagesForChat(chatId: string): Promise<Message[]> {
    // Delete expired messages first
    await this.cleanupExpiredMessages();

    if (this.useMongo && this.mongoDb) {
      const cursor = this.mongoDb.collection('messages').find({ chatId }).sort({ createdAt: 1 });
      const docs = await cursor.toArray();
      return docs.map((d: any) => {
        const { _id, ...msgObj } = d;
        return msgObj as Message;
      });
    } else {
      return this.localData.messages.filter(m => m.chatId === chatId);
    }
  }

  async storeMessage(message: Omit<Message, 'id' | 'createdAt' | 'expiresAt'>): Promise<Message> {
    const msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
    const now = new Date();
    const createdAt = now.toISOString();
    // Expiration date is exactly 48 hours later (2 days)
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    const fullMessage: Message = {
      ...message,
      id: msgId,
      createdAt,
      expiresAt
    };

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('messages').insertOne({ ...fullMessage });
      // Update lastMessage and lastMessageAt on parent chat
      await this.mongoDb.collection('chats').updateOne(
        { id: message.chatId },
        { $set: { lastMessage: message.text || (message.mediaType === 'image' ? '📷 Image' : '🎥 Video'), lastMessageAt: createdAt } }
      );
    } else {
      this.localData.messages.push(fullMessage);
      const chat = this.localData.chats.find(c => c.id === message.chatId);
      if (chat) {
        chat.lastMessage = message.text || (message.mediaType === 'image' ? '📷 Image' : '🎥 Video');
        chat.lastMessageAt = createdAt;
      }
      this.saveLocal();
    }

    return fullMessage;
  }

  async addMessageReaction(messageId: string, userId: string, emoji: string): Promise<Message | null> {
    if (this.useMongo && this.mongoDb) {
      const msg = await this.mongoDb.collection('messages').findOne({ id: messageId });
      if (!msg) return null;
      const reactions = msg.reactions || {};
      reactions[userId] = emoji;
      const result = await this.mongoDb.collection('messages').findOneAndUpdate(
        { id: messageId },
        { $set: { reactions } },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      const actualDoc = (result as any).value ? (result as any).value : result;
      const { _id, ...msgObj } = actualDoc as any;
      return msgObj as Message;
    } else {
      const msg = this.localData.messages.find(m => m.id === messageId);
      if (msg) {
        if (!msg.reactions) msg.reactions = {};
        msg.reactions[userId] = emoji;
        this.saveLocal();
        return msg;
      }
      return null;
    }
  }

  // Deletes expired messages (older than 48 hours from creation, i.e., current time > expiresAt)
  async cleanupExpiredMessages(): Promise<string[]> {
    const nowStr = new Date().toISOString();
    let deletedIds: string[] = [];

    if (this.useMongo && this.mongoDb) {
      try {
        // Find messages that are expired
        const cursor = this.mongoDb.collection('messages').find({ expiresAt: { $lt: nowStr } });
        const expired = await cursor.toArray();
        deletedIds = expired.map((m: any) => m.id);
        
        if (deletedIds.length > 0) {
          console.log(`[Database] Cleaning up ${deletedIds.length} expired messages from MongoDB.`);
          await this.mongoDb.collection('messages').deleteMany({ expiresAt: { $lt: nowStr } });
        }
      } catch (err) {
        console.error('Error during Mongo clean up', err);
      }
    } else {
      const nonExpired: Message[] = [];
      this.localData.messages.forEach(m => {
        if (new Date(m.expiresAt).getTime() < Date.now()) {
          deletedIds.push(m.id);
        } else {
          nonExpired.push(m);
        }
      });
      
      if (deletedIds.length > 0) {
        console.log(`[Database] Cleaning up ${deletedIds.length} expired messages from Local JSON DB.`);
        this.localData.messages = nonExpired;
        this.saveLocal();
      }
    }
    return deletedIds;
  }

  // STATUSES APIS (Expires after 24 hours)
  async createStatus(userId: string, username: string, avatar: string, text: string, backgroundColor: string): Promise<UserStatus> {
    const statusId = 'st_' + Math.random().toString(36).substr(2, 9);
    const now = new Date();
    const createdAt = now.toISOString();

    const newStatus: UserStatus = {
      id: statusId,
      userId,
      username,
      avatar,
      text,
      backgroundColor,
      createdAt
    };

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('statuses').insertOne({ ...newStatus });
    } else {
      if (!this.localData.statuses) this.localData.statuses = [];
      this.localData.statuses.push(newStatus);
      this.saveLocal();
    }
    return newStatus;
  }

  async getActiveStatuses(): Promise<UserStatus[]> {
    await this.cleanupExpiredStatuses();

    if (this.useMongo && this.mongoDb) {
      const cursor = this.mongoDb.collection('statuses').find().sort({ createdAt: -1 });
      const docs = await cursor.toArray();
      return docs.map((d: any) => {
        const { _id, ...statusObj } = d;
        return statusObj as UserStatus;
      });
    } else {
      if (!this.localData.statuses) this.localData.statuses = [];
      return [...this.localData.statuses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  async deleteStatus(statusId: string, userId: string): Promise<boolean> {
    if (this.useMongo && this.mongoDb) {
      const result = await this.mongoDb.collection('statuses').deleteOne({ id: statusId, userId });
      return result.deletedCount > 0;
    } else {
      if (!this.localData.statuses) this.localData.statuses = [];
      const lenBefore = this.localData.statuses.length;
      this.localData.statuses = this.localData.statuses.filter(s => !(s.id === statusId && s.userId === userId));
      const deleted = this.localData.statuses.length < lenBefore;
      if (deleted) {
        this.saveLocal();
      }
      return deleted;
    }
  }

  async cleanupExpiredStatuses(): Promise<void> {
    const now = Date.now();
    const limit = 24 * 60 * 60 * 1000; // 24 hours

    if (this.useMongo && this.mongoDb) {
      try {
        const threshold = new Date(now - limit).toISOString();
        await this.mongoDb.collection('statuses').deleteMany({ createdAt: { $lt: threshold } });
      } catch (err) {
        console.error('Error cleaning up statuses in mongo', err);
      }
    } else {
      if (!this.localData.statuses) this.localData.statuses = [];
      this.localData.statuses = this.localData.statuses.filter(s => {
        return (now - new Date(s.createdAt).getTime()) < limit;
      });
      this.saveLocal();
    }
  }

  // GROUP CHAT ROLES & MEMBERSHIP APIS
  async updateGroupAdmins(chatId: string, admins: string[]): Promise<Chat | null> {
    if (this.useMongo && this.mongoDb) {
      const result = await this.mongoDb.collection('chats').findOneAndUpdate(
        { id: chatId },
        { $set: { admins } },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      const actualDoc = (result as any).value ? (result as any).value : result;
      const { _id, ...chatObj } = actualDoc as any;
      return chatObj as Chat;
    } else {
      const chat = this.localData.chats.find(c => c.id === chatId);
      if (chat) {
        chat.admins = admins;
        this.saveLocal();
        return chat;
      }
      return null;
    }
  }

  async removeGroupMember(chatId: string, memberId: string): Promise<Chat | null> {
    if (this.useMongo && this.mongoDb) {
      const chatDoc = await this.mongoDb.collection('chats').findOne({ id: chatId });
      if (!chatDoc) return null;

      const members = (chatDoc.members || []).filter((m: string) => m !== memberId);
      const admins = (chatDoc.admins || []).filter((a: string) => a !== memberId);

      const result = await this.mongoDb.collection('chats').findOneAndUpdate(
        { id: chatId },
        { $set: { members, admins } },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      const actualDoc = (result as any).value ? (result as any).value : result;
      const { _id, ...chatObj } = actualDoc as any;
      return chatObj as Chat;
    } else {
      const chat = this.localData.chats.find(c => c.id === chatId);
      if (chat) {
        chat.members = (chat.members || []).filter(m => m !== memberId);
        chat.admins = (chat.admins || []).filter(a => a !== memberId);
        this.saveLocal();
        return chat;
      }
      return null;
    }
  }

  async addGroupMember(chatId: string, memberId: string): Promise<Chat | null> {
    if (this.useMongo && this.mongoDb) {
      const chatDoc = await this.mongoDb.collection('chats').findOne({ id: chatId });
      if (!chatDoc) return null;

      const members = Array.from(new Set([...(chatDoc.members || []), memberId]));

      const result = await this.mongoDb.collection('chats').findOneAndUpdate(
        { id: chatId },
        { $set: { members } },
        { returnDocument: 'after' }
      );
      if (!result) return null;
      const actualDoc = (result as any).value ? (result as any).value : result;
      const { _id, ...chatObj } = actualDoc as any;
      return chatObj as Chat;
    } else {
      const chat = this.localData.chats.find(c => c.id === chatId);
      if (chat) {
        chat.members = Array.from(new Set([...(chat.members || []), memberId]));
        this.saveLocal();
        return chat;
      }
      return null;
    }
  }

  // PROFILE MANAGEMENT APIS
  async updateUserProfile(userId: string, updates: { bio?: string; avatar?: string; isPublic?: boolean }): Promise<User | null> {
    const setObj: any = {};
    if (updates.bio !== undefined) setObj.bio = updates.bio.substring(0, 100); // Expanded from 20 to 100 for better statuses/bios!
    if (updates.avatar !== undefined) setObj.avatar = updates.avatar;
    if (updates.isPublic !== undefined) setObj.isPublic = updates.isPublic;

    if (this.useMongo && this.mongoDb) {
      await this.mongoDb.collection('users').updateOne({ id: userId }, { $set: setObj });
      return this.getUser(userId);
    } else {
      const user = this.localData.users.find(u => u.id === userId);
      if (user) {
        if (updates.bio !== undefined) user.bio = updates.bio.substring(0, 100);
        if (updates.avatar !== undefined) user.avatar = updates.avatar;
        if (updates.isPublic !== undefined) user.isPublic = updates.isPublic;
        this.saveLocal();
        return this.getUser(userId);
      }
      return null;
    }
  }

  // ADMINISTRATIVE DEV APIS
  async adminGetAllChats(): Promise<Chat[]> {
    if (this.useMongo && this.mongoDb) {
      const cursor = this.mongoDb.collection('chats').find({});
      const docs = await cursor.toArray();
      return docs.map((doc: any) => {
        const { _id, ...rest } = doc;
        return rest as Chat;
      });
    } else {
      return [...this.localData.chats];
    }
  }

  async adminDeleteUser(userId: string): Promise<boolean> {
    if (this.useMongo && this.mongoDb) {
      const res1 = await this.mongoDb.collection('users').deleteOne({ id: userId });
      await this.mongoDb.collection('messages').deleteMany({ senderId: userId });
      // Remove from friend arrays of other users
      await this.mongoDb.collection('users').updateMany(
        {},
        { $pull: { friends: userId, friendRequests: { fromId: userId } } as any }
      );
      // Remove from groups
      await this.mongoDb.collection('chats').updateMany(
        {},
        { $pull: { members: userId, admins: userId } as any }
      );
      return (res1.deletedCount || 0) > 0;
    } else {
      const idx = this.localData.users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        this.localData.users.splice(idx, 1);
        this.localData.messages = this.localData.messages.filter(m => m.senderId !== userId);
        this.localData.users.forEach(u => {
          u.friends = (u.friends || []).filter(fId => fId !== userId);
          u.friendRequests = (u.friendRequests || []).filter(r => r.fromId !== userId);
        });
        this.localData.chats.forEach(c => {
          c.members = (c.members || []).filter(mId => mId !== userId);
          c.admins = (c.admins || []).filter(aId => aId !== userId);
        });
        this.saveLocal();
        return true;
      }
      return false;
    }
  }

  async adminDeleteChat(chatId: string): Promise<boolean> {
    if (this.useMongo && this.mongoDb) {
      const res1 = await this.mongoDb.collection('chats').deleteOne({ id: chatId });
      await this.mongoDb.collection('messages').deleteMany({ chatId });
      return (res1.deletedCount || 0) > 0;
    } else {
      const idx = this.localData.chats.findIndex(c => c.id === chatId);
      if (idx !== -1) {
        this.localData.chats.splice(idx, 1);
        this.localData.messages = this.localData.messages.filter(m => m.chatId !== chatId);
        this.saveLocal();
        return true;
      }
      return false;
    }
  }
}

export const db = new DatabaseManager();
