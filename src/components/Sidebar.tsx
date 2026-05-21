import React, { useState, useEffect, useRef } from 'react';
import { Chat, User, AppTheme, UserStatus } from '../types';
import { THEMES } from '../theme';
import VerifiedBadge from './VerifiedBadge';
import { MessageSquarePlus, Search, LogOut, SunMoon, Radio, Sparkles, Bell, Users, MessageSquare, Check, X, PlusCircle, UserCheck, Trash } from 'lucide-react';
import { apiFetch as fetch } from '../utils/api';

interface SidebarProps {
  currentUser: User;
  currentTheme: AppTheme;
  chats: Chat[];
  activeChatId: string | null;
  usersOnlineMap: Record<string, boolean>; // userId -> isOnline tracker
  directoryUsers: User[]; // all directory contacts
  onSelectChat: (chatId: string) => void;
  onOpenNewChat: () => void;
  onThemeChange: (theme: AppTheme) => void;
  onLogout: () => void;
  token: string;
  onRefreshProfile?: () => void;
  statuses: UserStatus[];
  onAddStatus?: (status: UserStatus) => void;
  onDeleteStatus?: (statusId: string) => void;
  onViewUserProfile?: (u: User) => void;
  onChatCreated?: (chat: Chat) => void;
}

export default function Sidebar({
  currentUser,
  currentTheme,
  chats,
  activeChatId,
  usersOnlineMap,
  directoryUsers,
  onSelectChat,
  onOpenNewChat,
  onThemeChange,
  onLogout,
  token,
  onRefreshProfile,
  statuses,
  onAddStatus,
  onDeleteStatus,
  onViewUserProfile,
  onChatCreated
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'friends' | 'dev_dashboard'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Dev admin dashboard panel states
  const [adminData, setAdminData] = useState<{
    stats: {
      totalUsers: number;
      totalChats: number;
      onlineUsersCount: number;
      groupChatsCount: number;
      directChatsCount: number;
    };
    users: User[];
    chats: Chat[];
  } | null>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'chats'>('users');

  const fetchAdminStats = async () => {
    setIsLoadingAdmin(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAdminData(data);
      } else {
        setErrorStatus('Privilege check rejected. stats requires a Developer account.');
      }
    } catch (err) {
      setErrorStatus('Administrative API channel not ready.');
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const isCortexDev = (username?: string) => {
    if (!username) return false;
    const cleanUsername = username.trim().toLowerCase();
    return cleanUsername === 'cortex' ||
           cleanUsername.includes('cortex') ||
           cleanUsername === 'developer' ||
           cleanUsername === 'admin' ||
           cleanUsername === 'dev';
  };

  useEffect(() => {
    if (activeTab === 'dev_dashboard') {
      fetchAdminStats();
    }
  }, [activeTab]);

  const handleAdminDeleteUser = async (userId: string) => {
    if (!window.confirm('Delete this user account? All their messages will be purged!')) return;
    try {
      const resp = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        setSuccessStatus('User account and session pruned successfully.');
        fetchAdminStats();
      } else {
        const d = await resp.json();
        setErrorStatus(d.error || 'User deletion blocked.');
      }
    } catch {
      setErrorStatus('Failed to send admin deletion command.');
    }
  };

  const handleAdminDeleteChat = async (chatId: string) => {
    if (!window.confirm('Purge this conversational thread? This action is IRREVERSIBLE!')) return;
    try {
      const resp = await fetch(`/api/admin/chats/${chatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        setSuccessStatus('Conversational thread pruned successfully.');
        fetchAdminStats();
      } else {
        const d = await resp.json();
        setErrorStatus(d.error || 'Chat thread purge blocked.');
      }
    } catch {
      setErrorStatus('Failed to send admin chat purge command.');
    }
  };
  
  // Track friend requests sent in this session to update UI instantly
  const [pendingRequestsSent, setPendingRequestsSent] = useState<string[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  // Status-related state
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [newStatusText, setNewStatusText] = useState('');
  const [newStatusBg, setNewStatusBg] = useState('bg-gradient-to-tr from-teal-600 to-emerald-800');
  const [isPublishingStatus, setIsPublishingStatus] = useState(false);

  // Playing statuses state
  const [activeSeq, setActiveSeq] = useState<UserStatus[] | null>(null);
  const [activeSeqIdx, setActiveSeqIdx] = useState<number>(0);
  const [timerProgress, setTimerProgress] = useState<number>(0);
  const [statusReplyText, setStatusReplyText] = useState('');
  const [statusReplySending, setStatusReplySending] = useState(false);

  const handleSendStatusReply = async (e: React.FormEvent, status: UserStatus) => {
    e.preventDefault();
    if (!statusReplyText.trim() || statusReplySending) return;
    setStatusReplySending(true);
    try {
      // 1. Create or retrieve direct message chat with target user
      const chatResp = await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          isGroup: false,
          partnerId: status.userId
        })
      });
      if (chatResp.ok) {
        const chatData = await chatResp.json();
        const createdChat = chatData.chat;

        // 2. Post DM message quoting the status
        const quoteText = `Status Update: "${status.text}"`;
        await fetch(`/api/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            chatId: createdChat.id,
            text: statusReplyText,
            quotedMessageId: 'status-' + status.id,
            quotedMessageText: quoteText,
            quotedSenderName: status.username
          })
        });

        // 3. Switch view over to that chat so they see it!
        onSelectChat(createdChat.id);
        setActiveSeq(null);
        setStatusReplyText('');
      }
    } catch (err) {
      console.error('Failed replying to status:', err);
    } finally {
      setStatusReplySending(false);
    }
  };

  // Auto progression of viewing statuses
  useEffect(() => {
    if (!activeSeq) {
      setTimerProgress(0);
      return;
    }

    setTimerProgress(0);
    const totalDuration = 4000; // 4 seconds per slide
    const intervalTime = 40; // update progress every 40 ms
    const step = (intervalTime / totalDuration) * 100;

    const interval = setInterval(() => {
      setTimerProgress((prev) => {
        if (prev >= 100) {
          if (activeSeqIdx < activeSeq.length - 1) {
            setActiveSeqIdx((idx) => idx + 1);
          } else {
            setActiveSeq(null);
          }
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(interval);
  }, [activeSeq, activeSeqIdx]);

  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublishStatus = async () => {
    if (!newStatusText.trim()) return;
    setIsPublishingStatus(true);
    setPublishError(null);
    try {
      const response = await fetch('/api/statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text: newStatusText.trim(),
          backgroundColor: newStatusBg
        })
      });
      const data = await response.json();
      if (response.ok) {
        if (onAddStatus) {
          onAddStatus(data.status);
        }
        setNewStatusText('');
        setShowAddStatus(false);
      } else {
        setPublishError(data.error || 'Failed to publish status');
      }
    } catch (err) {
      setPublishError('Error publishing text status');
    } finally {
      setIsPublishingStatus(false);
    }
  };

  // Helper look up the opponent user card information for direct messages
  const getOpponentInfo = (chat: Chat) => {
    if (chat.isGroup) {
      return { name: chat.name || 'Group Workspace', avatar: '👥' };
    }
    const otherId = chat.members.find((id) => id !== currentUser.id);
    const opponentObj = directoryUsers.find((u) => u.id === otherId);
    return opponentObj
      ? { name: opponentObj.username, avatar: opponentObj.avatar, isOnline: usersOnlineMap[opponentObj.id] ?? opponentObj.isOnline }
      : { name: 'Chat Member', avatar: '👤', isOnline: false };
  };

  // Filter conversation list according to the user search query
  const filteredChats = chats.filter((c) => {
    const opp = getOpponentInfo(c);
    return opp.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const handleSendRequest = async (targetUsername: string, targetId: string) => {
    setErrorStatus(null);
    setSuccessStatus(null);
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUsername })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessStatus(`Friend request successfully sent to ${targetUsername}!`);
        setPendingRequestsSent(prev => [...prev, targetId]);
        if (onRefreshProfile) onRefreshProfile();
      } else {
        setErrorStatus(data.error || 'Failed to send request.');
      }
    } catch (err) {
      setErrorStatus('Failed to submit friend request.');
    }
  };

  const handleAcceptRequest = async (fromUserId: string) => {
    setErrorStatus(null);
    try {
      const response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fromUserId })
      });
      if (response.ok) {
        if (onRefreshProfile) onRefreshProfile();
        setSuccessStatus('Friend invitation accepted!');
      } else {
        const data = await response.json();
        setErrorStatus(data.error || 'Failed accepting.');
      }
    } catch (err) {
      setErrorStatus('Failed submitting acceptance.');
    }
  };

  const handleDeclineRequest = async (fromUserId: string) => {
    setErrorStatus(null);
    try {
      const response = await fetch('/api/friends/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fromUserId })
      });
      if (response.ok) {
        if (onRefreshProfile) onRefreshProfile();
        setSuccessStatus('Friend invitation declined.');
      } else {
        const data = await response.json();
        setErrorStatus(data.error || 'Failed declining request.');
      }
    } catch (err) {
      setErrorStatus('Encountered connection errors declining.');
    }
  };

  const handleStartDirectChat = async (targetId: string) => {
    setErrorStatus(null);
    setSuccessStatus(null);
    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          members: [targetId],
          isGroup: false
        })
      });
      const data = await response.json();
      if (response.ok && data.chat) {
        if (onChatCreated) {
          onChatCreated(data.chat);
        } else {
          onSelectChat(data.chat.id);
        }
        // Switch tab to 'chats' on successful selection
        setActiveTab('chats');
      } else {
        setErrorStatus(data.error || 'Failed to start direct conversation.');
      }
    } catch (err) {
      setErrorStatus('Encouraged network error starting chat.');
    }
  };

  const activeTheme = THEMES[currentTheme];
  const pendingRequests = currentUser.friendRequests || [];

  // Filter other users in the platform friends directory
  const filteredUsers = directoryUsers.filter((u) => {
    const cleanQuery = friendSearchQuery.trim().toLowerCase();
    if (!cleanQuery) return true;
    return u.username.toLowerCase().includes(cleanQuery);
  });

  return (
    <div className={`w-full md:w-[350px] border-r border-white/5 flex flex-col h-full bg-[#111b21] shrink-0 select-none`}>
      
      {/* Sidebar Profile Header */}
      <div className="p-4 bg-[#121b22] flex items-center justify-between border-b border-white/5">
        <div 
          onClick={() => onViewUserProfile?.(currentUser)}
          className="flex items-center gap-3 cursor-pointer hover:opacity-90 select-none group"
          title="View & Edit My Profile"
        >
          <div className="relative animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-[#202c33] flex items-center justify-center text-xl border border-white/10 select-none group-hover:border-[#00a884] transition-colors">
              {currentUser.avatar}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#121b22] animate-pulse"></span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate max-w-[110px] group-hover:text-emerald-400 transition-colors flex items-center gap-0.5" title={currentUser.username}>
              <span>{currentUser.username}</span>
              <VerifiedBadge username={currentUser.username} className="w-2.5 h-2.5" />
            </div>
            {/* Displaying Current user's bio */}
            <div className="text-[10px] text-emerald-400 font-medium truncate max-w-[110px]" title={currentUser.bio}>
              {currentUser.bio || 'Available 🚀'}
            </div>
          </div>
        </div>

        {/* Global Sidebar Action Controls */}
        <div className="flex items-center gap-1">
          
          {/* Notification Bell Panel Toggle */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowThemeSelector(false);
              }}
              title="Notification Centre"
              className={`p-2 rounded-lg hover:bg-white/5 transition-all relative ${
                showNotifications ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Bell className="w-4.5 h-4.5" />
              {pendingRequests.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-[9px] text-white font-black rounded-full flex items-center justify-center animate-bounce">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            {/* Notification Drawer panel */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 z-50 w-64 bg-[#182229] border border-white/5 rounded-xl p-3 shadow-2xl flex flex-col gap-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between pb-1 border-b border-white/5">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Friend Invites ({pendingRequests.length})
                  </span>
                  <button onClick={() => setShowNotifications(false)} className="text-[10px] hover:text-white text-gray-500">
                    Close
                  </button>
                </div>
                {pendingRequests.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-xs text-slate-400">No pending requests</div>
                ) : (
                  pendingRequests.map((req) => (
                    <div key={req.fromId} className="p-2 border border-white/5 bg-[#202c33]/40 rounded-lg flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl shrink-0">{req.fromAvatar}</span>
                        <span className="text-xs font-semibold text-white truncate flex-1">{req.fromUsername}</span>
                      </div>
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => handleAcceptRequest(req.fromId)}
                          className="bg-[#00a884] hover:opacity-90 text-[10px] text-white font-bold py-1 px-2.5 rounded transition-all active:scale-95 cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.fromId)}
                          className="bg-red-950/40 border border-red-500/20 hover:bg-red-900/40 text-[10px] text-red-300 py-1 px-2.5 rounded transition-all cursor-pointer"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quick theme toggler dropdown trigger */}
          <div className="relative">
            <button
              onClick={() => {
                setShowThemeSelector(!showThemeSelector);
                setShowNotifications(false);
              }}
              title="Change Workspace Theme"
              className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${
                showThemeSelector ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white'
              }`}
            >
              <SunMoon className="w-4.5 h-4.5" />
            </button>

            {/* Float Dropdown Panel */}
            {showThemeSelector && (
              <div className="absolute right-0 mt-2 z-50 w-48 bg-[#182229] border border-white/5 rounded-xl p-2 shadow-2xl flex flex-col gap-1">
                <div className="px-2 py-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                  Select Accent Theme
                </div>
                {(Object.keys(THEMES) as AppTheme[]).map((key) => {
                  const item = THEMES[key];
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onThemeChange(key);
                        setShowThemeSelector(false);
                      }}
                      className={`text-left text-xs px-2.5 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        currentTheme === key
                          ? 'bg-white/5 text-white'
                          : 'text-gray-400 hover:bg-[#202c33] hover:text-white'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.accentHex }}></span>
                      <span className="truncate">{item.name.replace('Dark Theme ', '')}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={onOpenNewChat}
            title="Start New Chat"
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Main Mode Toggles: Chats vs Status vs Directory Lookup vs Dev Stats */}
      <div className="p-3 bg-white/5 border-b border-white/5 flex gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 min-w-[65px] py-1 px-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
            activeTab === 'chats'
              ? 'bg-[#202c33] text-white border border-white/5'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" /> Chats
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 min-w-[65px] py-1 px-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
            activeTab === 'status'
              ? 'bg-[#202c33] text-white border border-white/5'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-emerald-400" /> Status
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 min-w-[65px] py-1 px-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
            activeTab === 'friends'
              ? 'bg-[#202c33] text-white border border-white/5'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Friends
        </button>
        {isCortexDev(currentUser.username) && (
          <button
            onClick={() => setActiveTab('dev_dashboard')}
            className={`flex-1 min-w-[75px] py-1 px-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-center flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'dev_dashboard'
                ? 'bg-red-950/40 text-red-300 border border-red-900/45 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5 hover:text-red-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-red-400" /> Devs
          </button>
        )}
      </div>

      {/* Operation logs feedback banner and cues */}
      {(errorStatus || successStatus) && (
        <div className="p-2 border-b border-white/5 flex items-center justify-between text-[10px] bg-[#121b22]">
          <span className={errorStatus ? "text-red-300 font-medium" : "text-emerald-400 font-medium"}>
            {errorStatus ? `⚠️ ${errorStatus}` : `✅ ${successStatus}`}
          </span>
          <button onClick={() => { setErrorStatus(null); setSuccessStatus(null); }} className="text-gray-500 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CHATS TAB VIEW PANEL */}
      {activeTab === 'chats' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Conversational searching bar */}
          <div className="p-3 bg-[#111b21] border-b border-white/5">
            <div className="flex items-center gap-2 bg-[#202c33] rounded-xl px-3 py-2 border border-transparent focus-within:border-white/10 transition-colors">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Active Conversation Threads List */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5 bg-[#111b21]">
            {filteredChats.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center justify-center gap-2 text-gray-500 text-xs select-none">
                <Radio className="w-8 h-8 opacity-30 animate-pulse" />
                <span>No conversations started.</span>
                <button
                  onClick={onOpenNewChat}
                  className="mt-1 text-xs font-semibold underline hover:text-white transition-colors cursor-pointer"
                  style={{ color: activeTheme.accentHex }}
                >
                  Start Chat
                </button>
              </div>
            ) : (
              filteredChats.map((chat) => {
                const opponent = getOpponentInfo(chat);
                const isActive = activeChatId === chat.id;

                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors relative ${
                      isActive ? 'bg-[#2a3942]/60' : 'hover:bg-[#202c33]/40'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      
                      {/* Chat Avatar bubble logic */}
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-full bg-[#1f2c34] flex items-center justify-center text-xl border border-white/5 select-none">
                          {opponent.avatar}
                        </div>
                        {/* Live Online Dot */}
                        {!chat.isGroup && opponent.isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-[2px] border-[#111b21]"></span>
                        )}
                      </div>

                      {/* Message labels and timestamp metrics */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className={`font-semibold text-sm truncate flex items-center gap-0.5 ${isActive ? 'text-white' : 'text-gray-100'}`}>
                            <span>{opponent.name}</span>
                            {!chat.isGroup && <VerifiedBadge username={opponent.name} className="w-2.5 h-2.5" />}
                          </h4>
                          {chat.lastMessageAt && (
                            <span className="text-[9px] text-gray-500 select-none">
                              {new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {chat.lastMessage || (
                            <span className="text-gray-500 italic">No messages yet.</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Left Active border focus accent highlight tag */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ backgroundColor: activeTheme.accentHex }}
                      ></span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* STATUS TAB VIEW DESIGN */}
      {activeTab === 'status' && (
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* My Status section */}
          <div className="p-4 bg-[#111b21] border-b border-white/5">
            <h3 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-3">My Status</h3>
            
            {statuses.filter(s => s.userId === currentUser.id).length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between bg-[#182229] p-3 rounded-xl border border-white/5">
                  <div 
                    onClick={() => {
                      const myItems = statuses.filter(s => s.userId === currentUser.id);
                      setActiveSeq(myItems);
                      setActiveSeqIdx(0);
                    }}
                    className="flex items-center gap-3 cursor-pointer group flex-1"
                  >
                    <div className="w-12 h-12 rounded-full p-0.5 border-2 border-emerald-400 flex items-center justify-center bg-[#1f2c34]">
                      <div className="w-full h-full rounded-full bg-gradient-to-tr from-teal-600 to-emerald-800 flex items-center justify-center text-sm font-bold text-white">
                        Status
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-white group-hover:text-emerald-400 transition-colors">My Active Status</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {statuses.filter(s => s.userId === currentUser.id).length} update(s) published
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setShowAddStatus(true)}
                    className="p-2 rounded-lg bg-[#00a884]/10 hover:bg-[#00a884]/20 border border-[#00a884]/20 text-[#00a884] font-bold text-xs select-none cursor-pointer"
                    title="Post another text status"
                  >
                    + Add New
                  </button>
                </div>

                {/* Individual status items with a manual custom delete button */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {statuses.filter(s => s.userId === currentUser.id).map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-[#182229]/40 p-2 rounded-lg border border-white/5 text-[11px] text-gray-300">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                        <p className="truncate italic">"{s.text}"</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[9px] text-gray-500 font-mono">
                          {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteStatus) onDeleteStatus(s.id);
                          }}
                          className="p-1 hover:bg-red-950/40 hover:text-red-400 text-gray-400 rounded transition-all cursor-pointer"
                          title="Delete this status"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div 
                onClick={() => setShowAddStatus(true)}
                className="flex items-center gap-3 bg-[#182229] p-3.5 rounded-xl border border-dashed border-white/10 hover:border-white/20 transition-all cursor-pointer group"
              >
                <div className="w-11 h-11 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  <PlusCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-xs text-white group-hover:text-emerald-400 transition-colors">Publish Text Status</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Share what is on your mind for 24 hours</p>
                </div>
              </div>
            )}
          </div>

          {/* Recent contact updates list */}
          <div className="flex-1 overflow-y-auto bg-[#111b21]">
            <div className="p-4">
              <h3 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-3">Recent Contact Updates</h3>
              
              {Object.keys(
                statuses
                  .filter(s => s.userId !== currentUser.id)
                  .reduce((acc, s) => {
                    if (!acc[s.userId]) acc[s.userId] = [];
                    acc[s.userId].push(s);
                    return acc;
                  }, {} as Record<string, UserStatus[]>)
              ).length === 0 ? (
                <div className="p-10 text-center text-xs text-gray-500">
                  No statuses published by your contacts in the last 24 hours.
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(
                    statuses
                      .filter(s => s.userId !== currentUser.id)
                      .reduce((acc, s) => {
                        if (!acc[s.userId]) acc[s.userId] = [];
                        acc[s.userId].push(s);
                        return acc;
                      }, {} as Record<string, UserStatus[]>)
                  ).map(([userId, userStatuses]) => {
                    const latest = userStatuses[0];
                    return (
                      <div 
                        key={userId} 
                        onClick={() => {
                          setActiveSeq(userStatuses);
                          setActiveSeqIdx(0);
                        }}
                        className="p-3 bg-[#182229]/60 hover:bg-[#182229]/90 border border-white/5 hover:border-white/10 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Colored Ring depending on status count */}
                          <div className="w-11 h-11 rounded-full p-0.5 border-2 border-[#00a884] flex items-center justify-center bg-[#1f2c34] shrink-0">
                            <span className="text-xl select-none">{latest.avatar || '👤'}</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-white truncate flex items-center gap-0.5">
                              <span>{latest.username}</span>
                              <VerifiedBadge username={latest.username} className="w-2.5 h-2.5" />
                            </h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5 mt-0.5">
                              {new Date(latest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {userStatuses.length} status{userStatuses.length > 1 ? 'es' : ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-[9px] text-[#00a884] font-bold bg-[#00a884]/10 border border-[#00a884]/20 py-0.5 px-2 rounded-full uppercase tracking-wider shrink-0">
                          Watch
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TEXT STATUS CREATION DIALOG DRAWER */}
      {showAddStatus && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs select-none">
          <div className="w-full max-w-sm bg-[#182229] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="p-3.5 border-b border-white/5 flex items-center justify-between bg-black/20">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Post 24hr Status Update</span>
              <button onClick={() => setShowAddStatus(false)} className="text-gray-400 hover:text-white cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inner Composer Space */}
            <div className="p-5 flex flex-col gap-4">
              
              {/* Foreground compositor card */}
              <div className={`w-full aspect-video rounded-xl ${newStatusBg} p-4 flex flex-col items-center justify-center relative shadow-inner overflow-hidden border border-white/5`}>
                <textarea
                  maxLength={150}
                  placeholder="Type what you want to share..."
                  value={newStatusText}
                  onChange={(e) => setNewStatusText(e.target.value)}
                  className="w-full bg-transparent text-white text-center font-bold text-sm placeholder-white/50 focus:outline-none resize-none px-2 max-h-24 py-1"
                />
                
                <span className="absolute bottom-2 right-3 text-[9px] text-white/60 font-medium">
                  {newStatusText.length}/150
                </span>
              </div>

              {/* Background gradient color palettes */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Background Style</span>
                <div className="flex gap-2.5 justify-center">
                  {[
                    'bg-gradient-to-tr from-teal-600 to-emerald-800',
                    'bg-gradient-to-tr from-purple-700 to-pink-600',
                    'bg-gradient-to-tr from-orange-600 to-amber-700',
                    'bg-gradient-to-tr from-blue-700 to-indigo-900',
                    'bg-gradient-to-tr from-rose-600 to-red-800'
                  ].map((bgClass) => (
                    <button
                      key={bgClass}
                      onClick={() => setNewStatusBg(bgClass)}
                      className={`w-7 h-7 rounded-full ${bgClass} cursor-pointer border-2 transition-transform ${
                        newStatusBg === bgClass ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Composition publisher buttons */}
              {publishError && (
                <p className="text-xs text-red-400 font-semibold text-center">
                  ⚠️ {publishError}
                </p>
              )}

              <button
                onClick={handlePublishStatus}
                disabled={isPublishingStatus || !newStatusText.trim()}
                className="w-full py-2 bg-[#00a884] hover:bg-[#00c298] disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md mt-2 cursor-pointer select-none"
              >
                {isPublishingStatus ? 'Publishing Status...' : 'Post Status Now 🪐'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME HORIZONTAL IMMERSIVE STATUS SEQUENCES PLAYER */}
      {activeSeq && activeSeq.length > 0 && (
        <div className={`fixed inset-0 z-50 ${activeSeq[activeSeqIdx].backgroundColor} flex flex-col justify-between animate-fade-in`}>
          
          {/* Progress Indicators & Metadata bar */}
          <div className="p-4 bg-gradient-to-b from-black/65 to-transparent flex flex-col gap-3 select-none">
            
            {/* Horizontal indicators bar */}
            <div className="flex gap-1">
              {activeSeq.map((s, idx) => {
                let widthPercent = 0;
                if (idx < activeSeqIdx) widthPercent = 100;
                if (idx === activeSeqIdx) widthPercent = timerProgress;
                
                return (
                  <div key={idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-40 ease-linear rounded-full"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Author details */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-black/30 border border-white/10 flex items-center justify-center text-lg shadow-sm">
                  {activeSeq[activeSeqIdx].avatar || '👤'}
                </div>
                <div>
                  <h4 className="text-white font-bold text-xs flex items-center gap-0.5">
                    <span>@{activeSeq[activeSeqIdx].username}</span>
                    <VerifiedBadge username={activeSeq[activeSeqIdx].username} className="w-2.5 h-2.5" />
                  </h4>
                  <p className="text-[10px] text-white/60 mt-0.5">
                    {new Date(activeSeq[activeSeqIdx].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Close Button Trigger */}
              <button 
                onClick={() => setActiveSeq(null)} 
                className="p-1.5 rounded-lg bg-black/20 text-white hover:bg-black/35 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered High Fidelity Typographic Status Text */}
          <div className="px-6 flex items-center justify-center text-center self-center flex-grow max-w-lg mb-8">
            <p className="font-sans font-black text-2xl md:text-3xl lg:text-4xl text-white tracking-wide leading-relaxed drop-shadow-md whitespace-pre-wrap break-words">
              {activeSeq[activeSeqIdx].text}
            </p>
          </div>

          {/* Invisible interactive tap left/right handlers */}
          <div className="absolute inset-x-0 top-20 bottom-0 flex select-none">
            <div 
              onClick={() => {
                if (activeSeqIdx > 0) {
                  setActiveSeqIdx(idx => idx - 1);
                }
              }}
              className="w-1/3 h-full cursor-pointer"
              title="Previous Slide"
            />
            <div 
              onClick={() => {
                if (activeSeqIdx < activeSeq.length - 1) {
                  setActiveSeqIdx(idx => idx + 1);
                } else {
                  setActiveSeq(null);
                }
              }}
              className="w-2/3 h-full cursor-pointer"
              title="Next Slide"
            />
          </div>

          {/* Footer controls space info with actual Reply Input */}
          <div className="p-4 bg-black/40 border-t border-white/10 z-40">
            <form 
              onSubmit={(e) => handleSendStatusReply(e, activeSeq[activeSeqIdx])}
              className="flex items-center gap-2 max-w-md mx-auto"
            >
              <input
                type="text"
                placeholder="Reply to status..."
                value={statusReplyText}
                onChange={(e) => setStatusReplyText(e.target.value)}
                className="flex-grow bg-white/10 hover:bg-white/15 focus:bg-[#202c33] text-white placeholder-white/60 border border-white/15 rounded-full px-4 py-2 text-xs focus:outline-none transition-all focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={!statusReplyText.trim() || statusReplySending}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/10 disabled:text-white/40 text-black font-bold p-2 px-3.5 rounded-full text-xs transition-colors cursor-pointer shrink-0"
              >
                {statusReplySending ? '...' : 'Send'}
              </button>
            </form>
            <div className="text-center text-[9px] text-white/40 select-none mt-2">
              Tap right margin to skip • Tap left to go back
            </div>
          </div>
        </div>
      )}

      {/* DIRECTORY ADD FRIENDS TAB */}
      {activeTab === 'friends' && (
        <div className="flex-grow flex flex-col min-h-0">
          <div className="p-3 bg-[#111b21] border-b border-white/5">
            <div className="flex items-center gap-2 bg-[#202c33] rounded-xl px-3 py-2 border border-transparent focus-within:border-white/10 transition-colors">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search registered contacts..."
                value={friendSearchQuery}
                onChange={(e) => setFriendSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Directory Users Render */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5 bg-[#111b21]">
            {filteredUsers.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-500">
                No users matched your parameters.
              </div>
            ) : (
              // Filter out current user from the add friends directory list
              filteredUsers.filter(u => u.id !== currentUser.id).map((u) => {
                const isFriend = currentUser.friends?.includes(u.id);
                const isPending = pendingRequestsSent.includes(u.id);
                const hasSentToMe = pendingRequests.some(r => r.fromId === u.id);

                return (
                  <div
                    key={u.id}
                    onClick={() => handleStartDirectChat(u.id)}
                    className="p-3.5 flex items-center justify-between hover:bg-[#202c33]/40 cursor-pointer active:scale-[0.99] transition-all select-none group"
                    title={`Click to start direct chat with @${u.username}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#1f2c34] flex items-center justify-center text-xl border border-white/5">
                          {u.avatar || '👤'}
                        </div>
                        {usersOnlineMap[u.id] && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#111b21]"></span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-sm flex items-center gap-1">
                          <span className="truncate">{u.username}</span>
                          <VerifiedBadge username={u.username} className="w-2.5 h-2.5" />
                        </div>
                        {/* 20-character limit bio in style */}
                        <div className="text-xs text-[#00a884] font-medium truncate max-w-[140px]" title={u.bio}>
                          {u.bio || 'Hey there! I use chat'}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      {isFriend ? (
                        <span className="text-[10px] text-emerald-400 font-bold bg-[#00a884]/10 border border-[#00a884]/20 py-1 px-2.5 rounded-full uppercase tracking-wider">
                          Friends ✅
                        </span>
                      ) : hasSentToMe ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptRequest(u.id);
                          }}
                          className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 py-1 px-2 rounded-lg cursor-pointer"
                        >
                          Accept
                        </button>
                      ) : isPending ? (
                        <span className="text-[10px] text-gray-400 font-semibold bg-white/5 py-1 px-2.5 rounded-full border border-white/5 inline-flex items-center gap-1">
                          Sent ⏳
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendRequest(u.username, u.id);
                          }}
                          className="text-[10px] font-bold text-white bg-[#00a884] hover:opacity-90 transition-all py-1.5 px-3 rounded-xl uppercase tracking-wider active:scale-95 cursor-pointer"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* DEV BOARD SYSTEM STATS AND ADMIN PANEL */}
      {activeTab === 'dev_dashboard' && (
        <div className="flex-grow flex flex-col min-h-0 text-slate-100 bg-[#111b21]">
          {/* Header portion */}
          <div className="p-3 bg-red-950/20 border-b border-red-900/15 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4.5 h-4.5 text-red-400 animate-pulse" />
              <span className="text-xs font-mono tracking-widest uppercase font-bold text-red-400">System Control</span>
            </div>
            <button
              onClick={fetchAdminStats}
              title="Refresh Stats"
              className="px-2 py-1 bg-red-950/40 border border-red-800/35 hover:bg-red-900/30 text-[10px] font-mono rounded cursor-pointer transition-colors"
            >
              REFRESH
            </button>
          </div>

          {isLoadingAdmin ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 select-none">
              <span className="animate-spin text-xl mb-2">⚡</span>
              <p className="font-mono text-[10px]">COMPILING SYSTEM TELEMETRY...</p>
            </div>
          ) : !adminData ? (
            <div className="p-6 text-center text-xs text-red-500">
              Failed to load admin telemetry data.
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Telemetry Cards Grid */}
              <div className="p-3 grid grid-cols-2 gap-2 bg-[#121b22]/70 border-b border-white/5">
                <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Registries</div>
                  <div className="text-xl font-bold text-white mt-1 font-mono">{adminData.stats.totalUsers}</div>
                  <div className="text-[8px] text-emerald-400 mt-0.5">{adminData.stats.onlineUsersCount} active now</div>
                </div>
                <div className="bg-white/5 border border-white/5 p-2 rounded-xl text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Acquired Threads</div>
                  <div className="text-xl font-bold text-white mt-1 font-mono">{adminData.stats.totalChats}</div>
                  <div className="text-[8px] text-blue-400 mt-0.5">{adminData.stats.groupChatsCount} groups • {adminData.stats.directChatsCount} DM</div>
                </div>
              </div>

              {/* Selector subtab menu */}
              <div className="flex border-b border-white/5 bg-black/15">
                <button
                  type="button"
                  onClick={() => { setAdminSubTab('users'); setAdminSearchQuery(''); }}
                  className={`flex-1 py-1.5 text-[10px] uppercase font-bold tracking-wider transition-all border-b-2 text-center cursor-pointer ${
                    adminSubTab === 'users'
                      ? 'border-red-500 text-red-400 bg-white/5'
                      : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  Users ({adminData.users.length})
                </button>
                <button
                  type="button"
                  onClick={() => { setAdminSubTab('chats'); setAdminSearchQuery(''); }}
                  className={`flex-1 py-1.5 text-[10px] uppercase font-bold tracking-wider transition-all border-b-2 text-center cursor-pointer ${
                    adminSubTab === 'chats'
                      ? 'border-red-500 text-red-400 bg-white/5'
                      : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  Chats ({adminData.chats.length})
                </button>
              </div>

              {/* Subtab Search inputs */}
              <div className="p-3 bg-[#111b21] border-b border-white/5">
                <div className="flex items-center gap-2 bg-[#202c33] rounded-xl px-2.5 py-1.5 border border-transparent focus-within:border-white/10 transition-colors">
                  <Search className="w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    placeholder={adminSubTab === 'users' ? "Search registrants by username..." : "Search room title/members..."}
                    value={adminSearchQuery}
                    onChange={(e) => setAdminSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
                  />
                  {adminSearchQuery && (
                    <button type="button" onClick={() => setAdminSearchQuery('')} className="text-gray-400 hover:text-white cursor-pointer select-none">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Main registry items list */}
              <div className="flex-1 overflow-y-auto divide-y divide-white/5 bg-black/5">
                {adminSubTab === 'users' ? (
                  adminData.users
                    .filter((u) => u.username.toLowerCase().includes(adminSearchQuery.toLowerCase()))
                    .map((usr) => (
                      <div key={usr.id} className="p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                            {usr.avatar || '👤'}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-xs text-white truncate">@{usr.username}</span>
                              <VerifiedBadge username={usr.username} className="w-2.5 h-2.5" />
                              <span className={`w-1.5 h-1.5 rounded-full ${usr.isOnline || usersOnlineMap[usr.id] ? 'bg-emerald-500' : 'bg-gray-600'}`}></span>
                            </div>
                            <div className="text-[10px] text-gray-400 truncate max-w-[150px]" title={usr.bio}>{usr.bio || 'No bio status'}</div>
                            <div className="text-[7px] text-gray-500 font-mono">ID: {usr.id}</div>
                          </div>
                        </div>

                        {usr.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleAdminDeleteUser(usr.id)}
                            title="Purge User Account"
                            className="p-1.5 hover:bg-red-950/60 rounded text-red-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                ) : (
                  adminData.chats
                    .filter((c) => {
                      const title = c.name || '';
                      return title.toLowerCase().includes(adminSearchQuery.toLowerCase()) || 
                             c.members.some(id => id.toLowerCase().includes(adminSearchQuery.toLowerCase()));
                    })
                    .map((chat) => (
                      <div key={chat.id} className="p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">
                              {chat.isGroup ? `👥 ${chat.name || 'Untitled Group'}` : `💬 Direct Thread`}
                            </span>
                            <span className="text-[8px] bg-white/5 px-1 rounded text-gray-400 shrink-0 font-mono">
                              {chat.members.length} peers
                            </span>
                          </div>
                          <div className="text-[8px] text-gray-500 font-mono mt-0.5">ID: {chat.id}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAdminDeleteChat(chat.id)}
                          title="Purge Conversational Thread"
                          className="p-1.5 hover:bg-red-950/60 rounded text-red-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Embedded Quick AI Chat Selector */}
      <div className="p-3 bg-[#121b22] border-t border-white/5 select-none shrink-0 border-r border-[#111b21]">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="text-gray-300 font-medium">Integrated AI Assistant</span>
          </div>
          <span className="text-[9px] text-gray-500">MEMBER @ai</span>
        </div>
      </div>

    </div>
  );
}
