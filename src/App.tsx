import { useState, useEffect } from 'react';
import { AppTheme, User, Chat, Message, UserStatus } from './types';
import { THEMES } from './theme';
import { connectSocket, disconnectSocket, socket } from './socket';
import { apiFetch as fetch, clearApiCache } from './utils/api';

import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import NewChatModal from './components/NewChatModal';
import AiCompanion from './components/AiCompanion';
import ProfileViewer from './components/ProfileViewer';

import { Sparkles, MessageSquare, Radio, CloudRain, Bell, X, LogOut } from 'lucide-react';

// Procedurally plays a pleasant alert sound for incoming push notifications on-the-fly
const playNotifySound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.type = 'sine';
    // Highly vivid dual-harmonic high ping (Bright and Loud)
    osc.frequency.setValueAtTime(880.00, audioContext.currentTime); // A5
    osc.frequency.setValueAtTime(1046.50, audioContext.currentTime + 0.08); // C6 high double chime
    gain.gain.setValueAtTime(0.40, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.24);
    osc.start();
    osc.stop(audioContext.currentTime + 0.25);
  } catch (err) {
    console.warn("Audio Synthesizer alert blocked / unavailable", err);
  }
};

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem('whatsapp_mvp_token');
  });
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('cortex_cache_currentUser');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('cortex_cache_theme') as AppTheme) || 'dark-green';
  });

  // Directory lists
  const [directoryUsers, setDirectoryUsers] = useState<User[]>(() => {
    try {
      const cached = localStorage.getItem('cortex_cache_directoryUsers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const cached = localStorage.getItem('cortex_cache_chats');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>(() => {
    try {
      const cached = localStorage.getItem('cortex_cache_messagesMap');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  
  // Custom WhatsApp MVP new features state
  const [statuses, setStatuses] = useState<UserStatus[]>(() => {
    try {
      const cached = localStorage.getItem('cortex_cache_statuses');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [viewedProfileUser, setViewedProfileUser] = useState<User | null>(null);
  const [recentNotificationToast, setRecentNotificationToast] = useState<{ title: string; body: string } | null>(null);
  
  // Real-time states
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [activeAiGeneratingChats, setActiveAiGeneratingChats] = useState<Record<string, boolean>>({});
  const [unreadChatIds, setUnreadChatIds] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('cortex_unread_chat_ids');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('cortex_unread_chat_ids', JSON.stringify(unreadChatIds));
  }, [unreadChatIds]);

  useEffect(() => {
    if (activeChatId) {
      setUnreadChatIds(prev => prev.filter(id => id !== activeChatId));
    }
  }, [activeChatId]);

  // UI Drawer modals toggles
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [aiCompanionOpen, setAiCompanionOpen] = useState(false);
  const [loadingApp, setLoadingApp] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Write Caches to localStorage dynamically as they change
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('cortex_cache_currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('cortex_cache_currentUser');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('cortex_cache_theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    localStorage.setItem('cortex_cache_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('cortex_cache_statuses', JSON.stringify(statuses));
  }, [statuses]);

  useEffect(() => {
    localStorage.setItem('cortex_cache_directoryUsers', JSON.stringify(directoryUsers));
  }, [directoryUsers]);

  useEffect(() => {
    localStorage.setItem('cortex_cache_messagesMap', JSON.stringify(messagesMap));
  }, [messagesMap]);

  // Request browser permission for native Web Push Notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {
        console.warn("Sandbox constraint blocking push permission request");
      }
    }
  }, []);

  // 1. Session check on startup
  useEffect(() => {
    const checkSession = async () => {
      const savedToken = localStorage.getItem('whatsapp_mvp_token');
      if (savedToken) {
        // Optimistically register socket sessions using cached user if available
        const cachedUserStr = localStorage.getItem('cortex_cache_currentUser');
        if (cachedUserStr) {
          try {
            const cachedUser = JSON.parse(cachedUserStr);
            connectSocket(cachedUser.id);
          } catch (e) {}
        }

        try {
          const response = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (response.ok && data.user) {
              setSessionToken(savedToken);
              setCurrentUser(data.user);
              setCurrentTheme(data.user.theme || 'dark-green');
              
              // Connect socket room nodes
              connectSocket(data.user.id);
            } else {
              // Only remove session if authentication is explicitly rejected (401 or 403)
              if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('whatsapp_mvp_token');
                localStorage.removeItem('cortex_cache_currentUser');
                localStorage.removeItem('cortex_cache_chats');
                localStorage.removeItem('cortex_cache_statuses');
                localStorage.removeItem('cortex_cache_directoryUsers');
                localStorage.removeItem('cortex_cache_messagesMap');
                setSessionToken(null);
                setCurrentUser(null);
              }
            }
          } else {
            console.warn('Session API response was not JSON. Server might be initializing or restarting.');
          }
        } catch (err) {
          console.error('Session restored error:', err);
        }
      }
      setLoadingApp(false);
    };
    checkSession();
  }, []);

  // 2. Load lists when currentUser changes
  useEffect(() => {
    if (!currentUser || !sessionToken) return;

    const loadDirectoryData = async () => {
      try {
        // Load active chats list
        const chatsResp = await fetch('/api/chats', {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const chatsType = chatsResp.headers.get('content-type');
        if (chatsType && chatsType.includes('application/json')) {
          const chatsData = await chatsResp.json();
          if (chatsResp.ok) {
            setChats(chatsData.chats || []);
          }
        }

        // Load active 24h statuses
        const statusResp = await fetch('/api/statuses', {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const statusType = statusResp.headers.get('content-type');
        if (statusType && statusType.includes('application/json')) {
          const statusData = await statusResp.json();
          if (statusResp.ok) {
            setStatuses(statusData.statuses || []);
          }
        }

        // Load directory users
        const usersResp = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const usersType = usersResp.headers.get('content-type');
        if (usersType && usersType.includes('application/json')) {
          const usersData = await usersResp.json();
          if (usersResp.ok) {
            setDirectoryUsers(usersData.users || []);
            
            // Construct online presence lookup maps of users
            const initialOnline: Record<string, boolean> = {};
            (usersData.users || []).forEach((u: User) => {
              initialOnline[u.id] = u.isOnline;
            });
            setOnlineUsers(initialOnline);
          }
        }
      } catch (err) {
        console.error('Failed loading profile directories', err);
      }
    };

    loadDirectoryData();
  }, [currentUser, sessionToken]);

  // 3. Load message log whenever activeChatId switches
  useEffect(() => {
    if (!activeChatId || !sessionToken) return;

    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/chats/${activeChatId}/messages`, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });
        const msgType = response.headers.get('content-type');
        if (msgType && msgType.includes('application/json')) {
          const data = await response.json();
          if (response.ok) {
            setMessagesMap(prev => ({
              ...prev,
              [activeChatId]: data.messages || []
            }));
            
            // Let server map socket to specific chat room channels
            socket.emit('join_room', { chatId: activeChatId });
          }
        }
      } catch (err) {
        console.error('Failed fetching histories logs', err);
      }
    };

    loadMessages();
  }, [activeChatId, sessionToken]);

  // Toast auto-clear timer
  useEffect(() => {
    if (!recentNotificationToast) return;
    const timeout = setTimeout(() => {
      setRecentNotificationToast(null);
    }, 3500);
    return () => clearTimeout(timeout);
  }, [recentNotificationToast]);

  // 4. Socket binder listeners setup
  useEffect(() => {
    if (!currentUser) return;

    // Incoming messages sync
    socket.on('message_received', ({ message }: { message: Message }) => {
      const targetChatId = message.chatId;

      setMessagesMap(prev => {
        const list = prev[targetChatId] || [];
        // Prevent listing duplicates
        if (list.some(m => m.id === message.id)) return prev;
        return {
          ...prev,
          [targetChatId]: [...list, message]
        };
      });

      // Update lastMessage on chats sidebar in-real-time
      setChats(prev => {
        return prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              lastMessage: message.text || (message.mediaType === 'image' ? '📷 Image' : '🎥 Video'),
              lastMessageAt: message.createdAt
            };
          }
          return c;
        });
      });

      // PUSH NOTIFICATION & DYNAMIC AUDIO TRIGGERS
      if (message.senderId !== currentUser.id) {
        // Play synthesized user audio bell pitch
        playNotifySound();

        // Check if window is inactive or workspace chat isn't currently open on screen
        const isNotActiveChat = activeChatId !== targetChatId;
        const isHidden = document.visibilityState === 'hidden';

        if (isNotActiveChat) {
          setUnreadChatIds(prev => prev.includes(targetChatId) ? prev : [...prev, targetChatId]);
        }

        if (isNotActiveChat || isHidden) {
          const alertBody = message.text || (message.mediaType === 'image' ? '📎 Sent a photo' : '📎 Sent a video clip');
          
          // 1. Native Web Push Notification (Standard desktop triggers)
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Cortex Chat • @${message.senderName}`, {
                body: alertBody,
                silent: true
              });
            } catch (err) {
              console.warn("Failed posting native alert", err);
            }
          }

          // 2. Beautiful fallback inline Float Toast notification
          setRecentNotificationToast({
            title: `Alert from @${message.senderName}`,
            body: alertBody.length > 55 ? alertBody.substring(0, 55) + '...' : alertBody
          });
        }
      }
    });

    // Real-time Status updates synchronizer
    socket.on('status_created', ({ status }: { status: UserStatus }) => {
      setStatuses((prev) => {
        if (prev.some((s) => s.id === status.id)) return prev;
        return [status, ...prev];
      });
    });

    // Real-time profiles sync
    socket.on('user_profile_updated', ({ user }: { user: User }) => {
      if (currentUser && user.id === currentUser.id) {
        setCurrentUser(user);
      }
      setDirectoryUsers((prev) => {
        if (!prev.some(u => u.id === user.id)) {
          return [...prev, user];
        }
        return prev.map((u) => (u.id === user.id ? user : u));
      });
    });

    socket.on('profile_updated', ({ user }: { user: User }) => {
      if (currentUser && user.id === currentUser.id) {
        setCurrentUser(user);
      }
      setDirectoryUsers((prev) => {
        if (!prev.some(u => u.id === user.id)) {
          return [...prev, user];
        }
        return prev.map((u) => (u.id === user.id ? user : u));
      });
    });

    socket.on('friend_requests_updated', ({ friendRequests }: { friendRequests: any[] }) => {
      setCurrentUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          friendRequests
        };
      });
    });

    // Real-time group modifications sync
    socket.on('group_updated', ({ chat }: { chat: Chat }) => {
      setChats((prev) => prev.map((c) => (c.id === chat.id ? chat : c)));
    });

    socket.on('group_member_removed', ({ chatId }: { chatId: string }) => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setRecentNotificationToast({
          title: 'Group Alert',
          body: 'You have been removed from this group by an administrator.'
        });
      }
    });

    // Presence update
    socket.on('user_presence_change', ({ userId, isOnline }: { userId: string; isOnline: boolean }) => {
      setOnlineUsers(prev => ({
        ...prev,
        [userId]: isOnline
      }));
    });

    // AI typing/generating updates trigger
    socket.on('ai_state_change', ({ isGenerating, chatId }: { isGenerating: boolean; chatId: string }) => {
      setActiveAiGeneratingChats(prev => ({
        ...prev,
        [chatId]: isGenerating
      }));
    });

    // Chat created (e.g., someone initiated a chat with us)
    socket.on('chat_created', ({ chat }: { chat: Chat }) => {
      setChats(prev => {
        if (prev.some(c => c.id === chat.id)) return prev;
        return [chat, ...prev];
      });
    });

    // Real-time automatic expiration synchronization (deletes messages older than 2 days immediately!)
    socket.on('messages_expired', ({ messageIds }: { messageIds: string[] }) => {
      console.log('[Socket] Expiration alert received. Removing items:', messageIds);
      
      // Filter expired messages from all local records right away!
      setMessagesMap(prev => {
        const updated: Record<string, Message[]> = {};
        Object.keys(prev).forEach(chatId => {
          updated[chatId] = prev[chatId].filter(m => !messageIds.includes(m.id));
        });
        return updated;
      });
    });

    socket.on('status_deleted', ({ statusId }: { statusId: string }) => {
      setStatuses(prev => prev.filter(s => s.id !== statusId));
    });

    socket.on('message_reaction_updated', ({ message }: { message: Message }) => {
      setMessagesMap(prev => {
        const list = prev[message.chatId] || [];
        return {
          ...prev,
          [message.chatId]: list.map(m => m.id === message.id ? message : m)
        };
      });
    });

    return () => {
      socket.off('message_received');
      socket.off('user_presence_change');
      socket.off('ai_state_change');
      socket.off('chat_created');
      socket.off('messages_expired');
      socket.off('status_created');
      socket.off('status_deleted');
      socket.off('message_reaction_updated');
      socket.off('profile_updated');
      socket.off('friend_requests_updated');
    };
  }, [currentUser, activeChatId]);

  // Handle Authentication Success
  const handleAuthSuccess = (token: string, user: any) => {
    localStorage.setItem('whatsapp_mvp_token', token);
    setSessionToken(token);
    setCurrentUser(user);
    setCurrentTheme(user.theme || 'dark-green');
    connectSocket(user.id);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogoutAction = () => {
    disconnectSocket();
    clearApiCache();
    localStorage.removeItem('whatsapp_mvp_token');
    localStorage.removeItem('cortex_cache_currentUser');
    localStorage.removeItem('cortex_cache_chats');
    localStorage.removeItem('cortex_cache_statuses');
    localStorage.removeItem('cortex_cache_directoryUsers');
    localStorage.removeItem('cortex_cache_messagesMap');
    setSessionToken(null);
    setCurrentUser(null);
    setActiveChatId(null);
    setChats([]);
    setStatuses([]);
    setDirectoryUsers([]);
    setMessagesMap({});
    setShowLogoutConfirm(false);
  };

  // Change Theme preference & synchronize with server
  const handleThemeChange = async (theme: AppTheme) => {
    setCurrentTheme(theme);
    if (!sessionToken) return;

    try {
      await fetch('/api/user/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ theme })
      });
    } catch (err) {
      console.error('Failed persisting webapp theme selection: ', err);
    }
  };

  const refreshUserProfile = async () => {
    if (!sessionToken || !currentUser) return;
    try {
      const resp = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.user) {
          setCurrentUser(d.user);
        }
      }

      const chatsResp = await fetch('/api/chats', {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      if (chatsResp.ok) {
        const chatsData = await chatsResp.json();
        setChats(chatsData.chats || []);
      }

      const usersResp = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        setDirectoryUsers(usersData.users || []);
      }
    } catch (e) {
      console.error('Failed refreshing profile feeds:', e);
    }
  };

  // Dispatch text/media messages over SocketIO room
  const handleSendMessage = (
    msgText: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | null,
    quotedMessageId?: string,
    quotedMessageText?: string,
    quotedSenderName?: string
  ) => {
    if (!activeChatId || !currentUser) return;

    const messagePayload = {
      chatId: activeChatId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderAvatar: currentUser.avatar,
      text: msgText,
      mediaUrl,
      mediaType,
      quotedMessageId,
      quotedMessageText,
      quotedSenderName
    };

    socket.emit('send_message', messagePayload, (status: any) => {
      if (status && status.error) {
        setRecentNotificationToast({
          title: 'Sync Error',
          body: status.error || 'Could not synchronize message with server node.'
        });
      }
    });
  };

  const handleChatCreated = (chat: Chat) => {
    setChats(prev => {
      if (prev.some(c => c.id === chat.id)) return prev;
      return [chat, ...prev];
    });
    setActiveChatId(chat.id);
    setNewChatOpen(false);
  };

  const activeTheme = THEMES[currentTheme];

  if (loadingApp) {
    return (
      <div className="h-screen h-[100dvh] w-screen bg-[#0b141a] flex flex-col justify-center items-center gap-4 text-white">
        <div className="w-10 h-10 border-4 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-sm font-medium tracking-wide">Connecting security buffers...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <div className={`h-screen h-[100dvh] w-screen flex relative overflow-hidden text-gray-200 ${activeTheme.bgApp} transition-colors duration-300 font-sans`}>
      
      {/* 2-Column WhatsApp Panel Shell */}
      <div className="flex-grow flex overflow-hidden h-full">
        
        {/* Left Side menu sidebar wrapper with responsive hide toggle */}
        <div className={`h-full shrink-0 ${activeChatId ? 'hidden md:flex md:w-[350px] lg:w-[420px]' : 'flex w-full md:w-[350px] lg:w-[420px]'}`}>
          <Sidebar
            currentUser={currentUser}
            currentTheme={currentTheme}
            token={sessionToken!}
            chats={chats}
            activeChatId={activeChatId}
            usersOnlineMap={onlineUsers}
            directoryUsers={directoryUsers}
            onSelectChat={setActiveChatId}
            onChatCreated={handleChatCreated}
            onOpenNewChat={() => setNewChatOpen(true)}
            onThemeChange={handleThemeChange}
            onLogout={handleLogout}
            statuses={statuses}
            onAddStatus={(newStatus) => setStatuses((prev) => {
              if (prev.some(s => s.id === newStatus.id)) return prev;
              return [newStatus, ...prev];
            })}
            onDeleteStatus={async (statusId: string) => {
              try {
                const response = await fetch(`/api/statuses/${statusId}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${sessionToken}` }
                });
                if (response.ok) {
                  setStatuses(prev => prev.filter(s => s.id !== statusId));
                }
              } catch (err) {
                console.error('Failed to delete status:', err);
              }
            }}
            onViewUserProfile={setViewedProfileUser}
            onRefreshProfile={refreshUserProfile}
            unreadChatIds={unreadChatIds}
          />
        </div>

        {/* Right Active pane area wrapper with responsive hide toggle */}
        <div className={`h-full flex-grow flex flex-col ${activeChatId ? 'flex w-full' : 'hidden md:flex'}`}>
          {activeChat ? (
            <ChatArea
              currentUser={currentUser}
              currentTheme={currentTheme}
              token={sessionToken!}
              activeChat={activeChat}
              directoryUsers={directoryUsers}
              messages={messagesMap[activeChatId!] || []}
              isAiGeneratingInChat={!!activeAiGeneratingChats[activeChatId!]}
              onSendMessage={handleSendMessage}
              onBackClick={() => setActiveChatId(null)}
              onViewUserProfile={setViewedProfileUser}
            />
          ) : (
            <div className="hidden md:flex flex-grow flex-col justify-center items-center text-center p-8 bg-[#222e35]/30">
              <div className={`p-5 rounded-full ${activeTheme.accentClass} bg-opacity-5 mb-4`}>
                <MessageSquare className="w-12 h-12" style={{ color: activeTheme.accentHex }} />
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">Cortex Chat</h2>
              <p className="text-xs text-gray-500 max-w-sm mt-1.5 leading-relaxed">
                Connect and coordinate with friends over Cortex Chat. Secure private streams, instantaneous AI helper assistance with <b className="text-gray-300">@ai</b> triggers, and 48 hours automatic thread deletion.
              </p>
              <button
                onClick={() => setNewChatOpen(true)}
                className="mt-6 py-2.5 px-6 font-semibold text-xs rounded-xl hover:opacity-90 transition-all shadow-md flex items-center gap-1.5"
                style={{
                  backgroundColor: activeTheme.accentHex,
                  color: currentTheme === 'dark-white' ? '#111b21' : '#ffffff',
                }}
              >
                <Radio className="w-4 h-4 text-xs animate-ping" /> Compose New Thread
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Embedded floating AI Assistant drawer */}
      {!activeChatId && (
        <AiCompanion
          currentTheme={currentTheme}
          token={sessionToken!}
          isOpen={aiCompanionOpen}
          onClose={() => setAiCompanionOpen(false)}
        />
      )}

      {/* Floating AI companion action trigger - System Wide globally */}
      {!activeChatId && !aiCompanionOpen && (
        <button
          type="button"
          onClick={() => setAiCompanionOpen(!aiCompanionOpen)}
          style={{
            backgroundColor: activeTheme.accentHex,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
          title="Toggle AI Companion Panel"
          className={`fixed bottom-6 right-6 z-40 p-4 rounded-full transition-all flex items-center justify-center hover:scale-110 active:scale-95 duration-200 cursor-pointer ${
            aiCompanionOpen ? 'rotate-90' : ''
          }`}
        >
          <Sparkles
            className="w-6 h-6 animate-pulse"
            style={{
              color: currentTheme === 'dark-white' ? '#111b21' : '#ffffff',
            }}
          />
        </button>
      )}



      {/* Compose New Chat Dialog overlay */}
      {newChatOpen && (
        <NewChatModal
          currentTheme={currentTheme}
          token={sessionToken!}
          onClose={() => setNewChatOpen(false)}
          onChatCreated={handleChatCreated}
        />
      )}

      {/* Profile Viewing / Editing Panel Overlay */}
      {viewedProfileUser && (
        <ProfileViewer
          user={viewedProfileUser}
          isSelf={viewedProfileUser.id === currentUser.id}
          token={sessionToken!}
          onClose={() => setViewedProfileUser(null)}
          onProfileUpdated={(updatedUser) => {
            setViewedProfileUser(updatedUser);
            if (updatedUser.id === currentUser.id) {
              setCurrentUser(updatedUser);
            }
            setDirectoryUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          }}
        />
      )}

      {/* Dynamic Floating Toast notification */}
      {recentNotificationToast && (
        <div 
          onClick={() => {
            setRecentNotificationToast(null);
          }}
          className="fixed top-4 right-4 z-50 max-w-sm w-full bg-[#1c2c35] border-l-4 border-[#00a884] shadow-2xl rounded-xl p-4 flex items-start gap-3.5 animate-bounce select-none cursor-pointer hover:bg-[#223540] transition-colors"
        >
          <div className="p-2 rounded-full bg-[#00a884]/15 text-[#00a884] shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-xs text-white uppercase tracking-wider">{recentNotificationToast.title}</h4>
            <p className="text-xs text-gray-300 mt-1 truncate">{recentNotificationToast.body}</p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setRecentNotificationToast(null);
            }} 
            className="text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Custom Logout Confirmation Modal to avoid sandboxed iframe confirm limits */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-55 bg-black/80 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs select-none">
          <div className="w-full max-w-xs bg-[#1a262f] border border-white/10 rounded-2xl p-5 shadow-2xl text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Sign Out</h3>
              <p className="text-xs text-gray-400 mt-1">Are you sure you want to sign out of Cortex Chat?</p>
            </div>
            <div className="flex gap-2.5 pt-1.5 font-sans">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer border border-white/5"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogoutAction}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
