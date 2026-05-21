import React, { useState, useRef, useEffect } from 'react';
import { User, Message, Chat, AppTheme } from '../types';
import { THEMES } from '../theme';
import FormattedMessage from './FormattedMessage';
import VerifiedBadge from './VerifiedBadge';
import { apiFetch as fetch } from '../utils/api';
import { 
  Send, 
  Image as ImageIcon, 
  Video, 
  Search, 
  Smile, 
  Trash, 
  Clock, 
  Paperclip, 
  Mic, 
  MicOff,
  Sparkles,
  ChevronDown,
  Info,
  CheckCheck,
  MoreVertical,
  ArrowLeft,
  X,
  Reply
} from 'lucide-react';

interface ChatAreaProps {
  currentUser: User;
  currentTheme: AppTheme;
  token: string;
  activeChat: Chat;
  directoryUsers: User[];
  messages: Message[];
  isAiGeneratingInChat: boolean;
  onSendMessage: (
    text: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | null,
    quotedMessageId?: string,
    quotedMessageText?: string,
    quotedSenderName?: string
  ) => void;
  onBackClick?: () => void;
  onViewUserProfile?: (u: User) => void;
}

// Interactive sample background list for chat wallpapers
const CHAT_WALLPAPERS = [
  { id: 'default', name: 'Original Cortex Dark', style: 'bg-[#0b141a]' },
  { id: 'charcoal', name: 'Sleek Deep Charcoal', style: 'bg-[#151c21]' },
  { id: 'velvet', name: 'Warm Crimson Velvet', style: 'bg-[#181216]' },
  { id: 'abyss', name: 'Atlantic Ocean Abyss', style: 'bg-[#08121d]' },
  { id: 'nord', name: 'Polar Nord Sky', style: 'bg-[#1a212d]' }
];

// Curated stock simulation media clips for user test sending
const PRESET_ATTACHMENTS = [
  { name: 'Abstract Cyberpunk Art', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=640', type: 'image' as const },
  { name: 'Modern Desk Setup', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=640', type: 'image' as const },
  { name: 'Nature Forest stream', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=640', type: 'image' as const },
  { name: 'Rotating Tech Gear animation', url: 'https://assets.mixkit.co/videos/preview/mixkit-circuit-board-details-close-up-1594-large.mp4', type: 'video' as const }
];

function isEmojiOnly(str: string): boolean {
  if (!str) return false;
  const clean = str.trim().replace(/\s/g, '');
  if (!clean) return false;
  try {
    const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]{1,15}$/u;
    return emojiRegex.test(clean);
  } catch (e) {
    return clean.length <= 15 && /[\uD800-\uDFFF]/.test(clean);
  }
}

export default function ChatArea({
  currentUser,
  currentTheme,
  token,
  activeChat,
  directoryUsers,
  messages,
  isAiGeneratingInChat,
  onSendMessage,
  onBackClick,
  onViewUserProfile
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedWallpaper, setSelectedWallpaper] = useState('default');
  const [showWallpaperMenu, setShowWallpaperMenu] = useState(false);
  
  // Custom interactive features
  const [typingState, setTypingState] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecordingSeconds, setAudioRecordingSeconds] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedWatchVideo, setSelectedWatchVideo] = useState<any | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; senderName: string } | null>(null);
  const [showReactionsForId, setShowReactionsForId] = useState<string | null>(null);

  // Group Management active states
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [selectedAddMemberId, setSelectedAddMemberId] = useState('');
  const [groupActionError, setGroupActionError] = useState('');
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioIntervalRef = useRef<any>(null);

  // Auto-scroll logic upon message feed or thread change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiGeneratingInChat]);

  // Audio timer ticker
  useEffect(() => {
    if (isRecordingAudio) {
      setAudioRecordingSeconds(0);
      audioIntervalRef.current = setInterval(() => {
        setAudioRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
    }
    return () => clearInterval(audioIntervalRef.current);
  }, [isRecordingAudio]);

  const activeTheme = THEMES[currentTheme];

  // Lookup naming and details for opponent(s)
  const getOpponentDetails = () => {
    if (activeChat.isGroup) {
      const groupUsernames = directoryUsers
        .filter((u) => activeChat.members.includes(u.id))
        .map((u) => u.username)
        .join(', ');
      return {
        name: activeChat.name || 'Group Chat Workspace',
        avatar: '👥',
        subText: `${activeChat.members.length} members: ${groupUsernames || 'You'}`
      };
    }

    const otherMemberId = activeChat.members.find((mId) => mId !== currentUser.id);
    const opponent = directoryUsers.find((u) => u.id === otherMemberId);
    
    return opponent
      ? {
          name: opponent.username,
          avatar: opponent.avatar,
          subText: opponent.isOnline ? 'Online now' : 'Offline'
        }
      : {
          name: 'Chat Member',
          avatar: '👤',
          subText: 'Status unavailable'
        };
  };

  const details = getOpponentDetails();

  // GROUP ADMINISTRATIVE OPERATIONS
  const handleAddMember = async () => {
    if (!selectedAddMemberId) return;
    setGroupActionError('');
    try {
      const resp = await fetch(`/api/chats/${activeChat.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ memberId: selectedAddMemberId })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setGroupActionError(data.error || 'Failed to add member to group');
      } else {
        setSelectedAddMemberId('');
      }
    } catch {
      setGroupActionError('Error connecting to group members server.');
    }
  };

  const handleKickMember = async (memberUserId: string) => {
    setGroupActionError('');
    try {
      const resp = await fetch(`/api/chats/${activeChat.id}/members/${memberUserId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (!resp.ok) {
        setGroupActionError(data.error || 'Failed to remove member from group');
      }
    } catch {
      setGroupActionError('Error executing remove member operation.');
    }
  };

  const handlePromoteAdmin = async (targetUserId: string) => {
    setGroupActionError('');
    const currentAdmins = activeChat.admins || [];
    if (currentAdmins.includes(targetUserId)) return;
    try {
      const resp = await fetch(`/api/chats/${activeChat.id}/admins`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ admins: [...currentAdmins, targetUserId] })
      });
      const data = await resp.json();
      if (!resp.ok) {
        setGroupActionError(data.error || 'Failed to promote member');
      }
    } catch {
      setGroupActionError('Error executing promote admin operation.');
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(
      inputText,
      undefined,
      undefined,
      replyingTo?.id,
      replyingTo?.text,
      replyingTo?.senderName
    );
    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    try {
      await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });
    } catch (err) {
      console.error('Failed submitting message reaction:', err);
    }
  };

  const handleSendAttachment = (url: string, type: 'image' | 'video') => {
    onSendMessage(`Sent attachment: ${type === 'image' ? '📷 Photo' : '🎥 Video Clip'}`, url, type);
    setShowAttachmentMenu(false);
  };

  // Recording triggers simulation
  const handleToggleRecording = () => {
    if (isRecordingAudio) {
      // Send simulated recording clip
      onSendMessage(`🎤 Voice Note (${audioRecordingSeconds}s of secure real-time clip)`);
      setIsRecordingAudio(false);
    } else {
      setIsRecordingAudio(true);
    }
  };

  // Filters messages based on in-app searching
  const filteredMessages = messages.filter((m) =>
    chatSearchQuery.trim() === ''
      ? true
      : m.text.toLowerCase().includes(chatSearchQuery.trim().toLowerCase())
  );

  const formatRemainingTime = (createdAtStr: string) => {
    try {
      const created = new Date(createdAtStr).getTime();
      const expirationTime = created + 172800000; // 48 Hours in Milliseconds
      const delta = expirationTime - Date.now();
      if (delta <= 0) return 'Expired soon';
      const hoursLeft = Math.ceil(delta / (1000 * 60 * 60));
      return `${hoursLeft}h left`;
    } catch {
      return '48h expire';
    }
  };

  const selectedWallpaperStyle = CHAT_WALLPAPERS.find(w => w.id === selectedWallpaper)?.style || 'bg-[#0b141a]';

  return (
    <div className="flex-grow flex flex-col h-full bg-[#121b22] relative border-r border-white/5 md:border-r-0 min-w-0">
      
      {/* Active Header Section */}
      <div className="p-3.5 bg-[#121b22] border-b border-white/5 flex items-center justify-between z-10 select-none shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5 min-w-0">
          
          {/* Mobile Back navigation Chevron */}
          {onBackClick && (
            <button
              onClick={onBackClick}
              className="md:hidden p-2 mr-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
              title="Back to conversations list"
            >
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </button>
          )}

          <div 
            onClick={() => {
              if (activeChat.isGroup) {
                setShowGroupSettings(true);
              } else {
                const otherId = activeChat.members.find(m => m !== currentUser.id);
                const oppUser = directoryUsers.find(u => u.id === otherId);
                if (oppUser && onViewUserProfile) onViewUserProfile(oppUser);
              }
            }}
            className="w-10 h-10 rounded-full bg-[#1f2c34] flex items-center justify-center text-xl shrink-0 border border-white/5 cursor-pointer hover:scale-105 transition-transform"
            title={activeChat.isGroup ? "View Group Info & Administration Settings" : "View Friend Profile"}
          >
            {details.avatar}
          </div>
          <div 
            onClick={() => {
              if (activeChat.isGroup) {
                setShowGroupSettings(true);
              } else {
                const otherId = activeChat.members.find(m => m !== currentUser.id);
                const oppUser = directoryUsers.find(u => u.id === otherId);
                if (oppUser && onViewUserProfile) onViewUserProfile(oppUser);
              }
            }}
            className="min-w-0 cursor-pointer group"
            title={activeChat.isGroup ? "View Group Info & Administration Settings" : "View Friend Profile"}
          >
            <h3 className="font-semibold text-sm text-white truncate leading-tight group-hover:text-emerald-400 transition-colors flex items-center gap-1">
              <span>{details.name}</span>
              {!activeChat.isGroup && <VerifiedBadge username={details.name} />}
            </h3>
            <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[200px] md:max-w-md">
              {details.subText}
            </p>
          </div>
        </div>

        {/* Header Options & Search bar hooks */}
        <div className="flex items-center gap-2">
          
          {/* Group Settings / Info triggers */}
          {activeChat.isGroup && (
            <button
              onClick={() => setShowGroupSettings(true)}
              className="p-2 rounded-lg hover:bg-[#202c33]/40 border border-[#00a884]/20 bg-[#00a884]/5 text-[#00a884] transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5"
              title="Group Management Panel"
            >
              <Info className="w-4 h-4" /> Info
            </button>
          )}
          
          {/* Chat wallpaper toggler */}
          <div className="relative">
            <button
              onClick={() => {
                setShowWallpaperMenu(!showWallpaperMenu);
                setShowAttachmentMenu(false);
              }}
              className={`p-2 rounded-lg transition-colors hover:bg-white/5 ${
                showWallpaperMenu ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Chat Wallpaper Settings"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>

            {showWallpaperMenu && (
              <div className="absolute right-0 mt-2 z-50 w-52 bg-[#182229] border border-white/5 rounded-xl p-2 shadow-2xl flex flex-col gap-1">
                <div className="px-2 py-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                  Select Chat Wallpaper
                </div>
                {CHAT_WALLPAPERS.map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => {
                      setSelectedWallpaper(wp.id);
                      setShowWallpaperMenu(false);
                    }}
                    className={`text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                      selectedWallpaper === wp.id
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:bg-[#202c33] hover:text-white'
                    }`}
                  >
                    <span>{wp.name}</span>
                    <span className={`w-3 h-3 rounded-full border border-white/20`} style={{ backgroundColor: wp.id === 'default' ? '#0b141a' : wp.id === 'charcoal' ? '#151c21' : wp.id === 'velvet' ? '#181216' : wp.id === 'abyss' ? '#08121d' : '#1a212d' }}></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setShowChatSearch(!showChatSearch);
              if (showChatSearch) setChatSearchQuery('');
            }}
            className={`p-2 rounded-lg transition-colors hover:bg-white/5 ${
              showChatSearch ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white'
            }`}
            title="Search logs within this thread"
          >
            <Search className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Inside Thread searching strip */}
      {showChatSearch && (
        <div className="p-3 bg-[#111b21] border-b border-white/5 flex items-center justify-between gap-3 text-xs z-10 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-[#202c33] rounded-xl px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Find content inside this chat..."
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              className="w-full bg-transparent focus:outline-none text-white text-xs placeholder-gray-500"
            />
          </div>
          <button
            onClick={() => {
              setShowChatSearch(false);
              setChatSearchQuery('');
            }}
            className="text-gray-400 hover:text-white shrink-0 text-xs hover:underline"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Primary Message Log Feed */}
      <div className={`flex-grow overflow-y-auto px-3.5 py-4 md:p-5 space-y-2.5 select-text ${selectedWallpaperStyle} relative`}>
        
        {/* Ephemeral warning info badge banner */}
        <div className="flex justify-center select-none py-1">
          <div className="max-w-md bg-white/5 border border-white/5 rounded-xl px-3.5 py-2 text-[10px] text-gray-400 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              Messages are securely transmitted to room peers. For security and privacy, messages are fully automated to automatically expire in 48 hours.
            </div>
          </div>
        </div>

        {/* Message items loop */}
        {filteredMessages.length === 0 ? (
          <div className="h-4/5 flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-12 h-12 rounded-full border border-white/5 bg-[#182229] flex items-center justify-center text-gray-500 text-lg mb-3">
              💬
            </div>
            <p className="text-xs text-gray-400">
              {chatSearchQuery.trim() !== '' ? 'No matching message content found.' : 'Say hello to start! Mention @ai to get AI helper.'}
            </p>
          </div>
        ) : (
          filteredMessages.map((message) => {
            const isMe = message.senderId === currentUser.id;
            const isAi = message.senderName === 'AI Assistant' || message.text.includes('@ai ');
            const isSticker = isEmojiOnly(message.text);
            
            return (
              <div
                key={message.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {/* Peer user info identifier label for Group spaces */}
                {activeChat.isGroup && !isMe && (
                  <span 
                    onClick={() => {
                      const peerObj = directoryUsers.find((u) => u.id === message.senderId);
                      if (peerObj && onViewUserProfile) onViewUserProfile(peerObj);
                    }}
                    className="text-[10px] text-gray-400 font-bold mb-1 ml-2 select-none uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:text-emerald-400 transition-colors"
                    title={`View @${message.senderName}'s Profile`}
                  >
                    <span>{message.senderAvatar}</span>
                    <span className="flex items-center gap-0.5">
                      {message.senderName}
                      <VerifiedBadge username={message.senderName} className="w-2.5 h-2.5" />
                    </span>
                  </span>
                )}

                <div
                  className={`max-w-[88%] md:max-w-[75%] rounded-2xl py-2 px-3 relative transition-all duration-300 group/msg flex flex-col gap-1 ${
                    isSticker
                      ? 'bg-transparent border-transparent shadow-none p-0'
                      : (isMe ? 'text-white border border-white/5 shadow border-b border-b-black/10' : 'bg-[#202c33] text-gray-100 border border-white/5 shadow border-b border-b-black/20')
                  }`}
                  style={{
                    backgroundColor: (!isSticker && isMe) ? activeTheme.accentHex : undefined,
                    color: (!isSticker && isMe && currentTheme === 'dark-white') ? '#111b21' : undefined
                  }}
                >
                  
                  {/* Floating Action Menu for Quick Reply and Reactions on Hover/Tap */}
                  <div className="absolute top-1.5 right-2 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity duration-150 z-20 flex gap-1 bg-[#121b22]/90 border border-white/10 rounded-lg p-0.5 shadow-lg select-none p-1">
                    <button
                      type="button"
                      onClick={() => setReplyingTo({ id: message.id, text: message.text, senderName: message.senderName })}
                      title="Reply"
                      className="p-1 hover:bg-white/10 rounded cursor-pointer text-gray-300 hover:text-white transition-colors"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReactionsForId(showReactionsForId === message.id ? null : message.id)}
                      title="React with emoji"
                      className="p-1 hover:bg-white/10 rounded cursor-pointer text-gray-300 hover:text-white transition-colors"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Absolute positioning of reactions preset bar */}
                  {showReactionsForId === message.id && (
                    <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-[#1f2c34] p-1.5 px-2.5 rounded-full border border-white/15 shadow-2xl animate-fade-in select-none">
                      {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            handleReactToMessage(message.id, emoji);
                            setShowReactionsForId(null);
                          }}
                          className="text-base hover:scale-130 transition-transform active:scale-95 text-white cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quoted Reply content box inside bubble */}
                  {message.quotedMessageText && (
                    <div className="mb-0.5 bg-black/25 border-l-4 border-emerald-500 rounded-lg p-2 text-left text-xs text-gray-200 select-none max-w-full">
                      <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-0.5">
                        <span>@{message.quotedSenderName}</span>
                        <VerifiedBadge username={message.quotedSenderName} className="w-2.5 h-2.5" />
                      </div>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {message.quotedMessageText}
                      </p>
                    </div>
                  )}
                  
                  {/* Media container display support */}
                  {message.mediaUrl && (
                    <div className="rounded-xl overflow-hidden bg-black/20 border border-white/5 max-h-[250px] overflow-hidden">
                      {message.mediaType === 'video' ? (
                        <video 
                          src={message.mediaUrl} 
                          controls 
                          className="max-h-[250px] w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <img 
                          src={message.mediaUrl} 
                          alt="Message attachment description" 
                          className="max-h-[250px] w-full object-cover hover:scale-[1.03] transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  )}

                  {/* CUSTOM AUTOLINK EXTRACED MEDIA VIEW FOR TWITTER, TIKTOK, YT, IG, FB */}
                  {message.autolink && (
                    <div className="mt-1 border border-white/10 bg-[#182229] rounded-xl overflow-hidden shadow-lg hover:border-white/20 transition-all text-slate-100 max-w-full">
                      {/* Media Card header */}
                      <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-[#00a884]">
                        <span className="truncate">{message.autolink.platform} dynamic downloader</span>
                        <span className="text-gray-400 font-mono text-[9px] shrink-0">{message.autolink.quality || 'Standard'}</span>
                      </div>
                      
                      {/* Thumbnail if loaded */}
                      {message.autolink.thumbnail ? (
                        <div className="relative aspect-video w-full bg-black/35 overflow-hidden">
                          <img 
                            src={message.autolink.thumbnail} 
                            alt={message.autolink.title} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer" 
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent p-2">
                            <p className="text-[11px] font-semibold text-white truncate">{message.autolink.title}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-black/15">
                          <p className="text-xs font-semibold text-slate-200 line-clamp-2">{message.autolink.title}</p>
                        </div>
                      )}

                      {/* Video action triggers strip */}
                      <div className="p-2 bg-black/10 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedWatchVideo(message.autolink)}
                          className="flex-1 py-1.5 bg-white/10 hover:bg-white/15 text-white font-bold text-[10px] rounded-lg text-center cursor-pointer select-none transition-colors"
                        >
                          WATCH INLINE 📺
                        </button>
                        <a
                          href={message.autolink.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-grow py-1.5 bg-[#00a884] hover:bg-[#00c298] text-white font-bold text-[10px] rounded-lg text-center cursor-pointer select-none transition-colors"
                        >
                          DOWNLOAD HD 📥
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Message body contents with formatting */}
                  <div>
                    {isSticker ? (
                      <div className="text-5xl md:text-6xl py-2 px-1 text-center scale-100 font-sans cursor-text select-all leading-normal tracking-wide transition-all transform active:scale-110 select-none duration-150">
                        {message.text}
                      </div>
                    ) : (
                      <FormattedMessage text={message.text} />
                    )}
                  </div>

                  {/* Bottom metrics panel row */}
                  <div className="flex items-center justify-between gap-4 mt-1 select-none text-[9px] opacity-70">
                    <div className="flex items-center gap-1 text-[8px] tracking-wide font-mono bg-black/10 px-1.5 py-0.5 rounded border border-white/5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{formatRemainingTime(message.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-sans">
                      <span>
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && <CheckCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </div>
                  </div>

                  {/* Message Reactions List Badge overlay */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className="absolute -bottom-2.5 right-3.5 z-10 flex items-center gap-1 bg-[#1f2c34] border border-white/10 rounded-full px-2 py-0.5 shadow-md select-none">
                      <div className="flex items-center -space-x-1">
                        {Array.from(new Set(Object.values(message.reactions))).slice(0, 3).map((emoji, idx) => (
                          <span key={idx} className="text-xs">{emoji}</span>
                        ))}
                      </div>
                      <span className="text-[9px] text-gray-300 font-bold ml-0.5">
                        {Object.keys(message.reactions).length}
                      </span>
                    </div>
                  )}

                </div>
              </div>
            );
          })
        )}

        {/* AI response generation loading indicator status bubbles in thread */}
        {isAiGeneratingInChat && (
          <div className="flex items-center gap-2 text-xs bg-[#202c33] text-gray-300 py-2.5 px-4 rounded-2xl w-fit self-start border border-white/5 animate-pulse">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            🤖 AI companion is assembling response...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Preset mock quick media attachments bar */}
      {showAttachmentMenu && (
        <div className="p-3 bg-[#182229] border-t border-white/5 text-xs animate-fadeIn select-none z-20 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[10px] text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5 text-emerald-500" /> Share Sandbox Attachment
            </span>
            <button
              onClick={() => setShowAttachmentMenu(false)}
              className="p-1 rounded-md text-gray-500 hover:text-white transition-colors hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_ATTACHMENTS.map((item, id) => (
              <button
                key={id}
                onClick={() => handleSendAttachment(item.url, item.type)}
                className="p-2 bg-[#202c33] rounded-lg border border-white/5 hover:border-white/25 flex flex-col items-center gap-1 text-center group transition-all"
              >
                {item.type === 'video' ? (
                  <Video className="w-5 h-5 text-[#00a884] group-hover:scale-110 transition-transform" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-[10px] text-gray-300 font-medium truncate w-full">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main chat typing panel bar container */}
      <div className="p-3.5 bg-[#121b22] border-t border-white/5 flex flex-col gap-2 select-none shrink-0 z-10 shadow-lg">
        
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between bg-black/35 border-l-4 border-emerald-500 rounded-lg p-3 px-4 mb-1 animate-fade-in gap-3 text-left">
            <div className="flex-grow min-w-0 pr-2">
              <span className="block text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Replying to @{replyingTo.senderName}</span>
              <p className="text-xs text-gray-400 truncate mt-0.5">{replyingTo.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-3">
          
          {/* Quick trigger button for attachment sandbox list */}
          <button
            type="button"
            onClick={() => {
              setShowAttachmentMenu(!showAttachmentMenu);
              setShowWallpaperMenu(false);
            }}
            title="Attach stock graphics / videos"
            className={`p-2.5 rounded-xl transition-colors shrink-0 ${
              showAttachmentMenu ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Paperclip className="w-4.5 h-4.5" />
          </button>

          {/* Quick emoji popover buttons list */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Select quick reaction emojis"
              className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                showEmojiPicker ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Smile className="w-4.5 h-4.5" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 z-50 bg-[#182229] border border-white/10 p-2.5 rounded-2xl shadow-2xl flex flex-col gap-1 w-64 max-h-56 overflow-y-auto">
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    '💡', '🔥', '✅', '❤️', '🚀', '🐱', '🦊', '🎨', '🎉', '💻',
                    '😂', '🤣', '😍', '🥳', '😎', '😭', '😱', '🤔', '👍', '🙏',
                    '👏', '🙌', '✨', '🌟', '💥', '🍕', '🍰', '☕', '🎮', '⚽',
                    '🌍', '🌈', '🐶', '🦄', '👾', '👻', '👑', '💸', '📱', '⚡',
                    '🎈', '🎁', '🍀', '🍎', '🥑', '🧁', '🍣', '🎯', '🎸', '✈️',
                    '🏝️', '🛸', '⏰', '🩹', '👋', '👀', '💯', '🦾', '🧠', '🧙'
                  ].map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        setInputText((prev) => prev + em);
                      }}
                      className="text-xl p-1.5 rounded-xl hover:bg-white/10 active:scale-90 transition-all cursor-pointer flex items-center justify-center font-sans"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat input box */}
          <input
            type="text"
            placeholder={
              isRecordingAudio 
                ? "🎙️ Currently transmitting simulated voice note clip..." 
                : "Type message... Mention @ai to query companion helpers"
            }
            disabled={isRecordingAudio}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              // Trigger minor typing state visuals mock
              if (!typingState && e.target.value.length > 0) {
                setTypingState(true);
                setTimeout(() => setTypingState(false), 2000);
              }
            }}
            className="flex-grow bg-[#202c33] text-sm text-white focus:outline-none placeholder-gray-500 border border-white/5 rounded-xl px-4 py-3 focus:border-gray-500 transition-colors"
          />

          {/* Voice recording simulations */}
          <button
            type="button"
            onClick={handleToggleRecording}
            title={isRecordingAudio ? "Stop and broadcast voice clip" : "Record secure voice message"}
            className={`p-2.5 rounded-xl transition-all shrink-0 ${
              isRecordingAudio 
                ? 'bg-red-600 text-white animate-pulse' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {isRecordingAudio ? (
              <span className="flex items-center gap-1">
                <MicOff className="w-4.5 h-4.5" />
                <span className="text-[10px] font-bold">{audioRecordingSeconds}s</span>
              </span>
            ) : (
              <Mic className="w-4.5 h-4.5" />
            )}
          </button>

          {/* Message dispatch CTA */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className={`p-3 rounded-xl transition-all font-semibold shrink-0 cursor-pointer ${
              !inputText.trim() 
                ? 'bg-[#182229] text-gray-500 cursor-not-allowed' 
                : 'hover:opacity-90 hover:scale-[1.03]'
            }`}
            style={{ 
              backgroundColor: inputText.trim() ? activeTheme.accentHex : undefined,
              color: inputText.trim() && currentTheme === 'dark-white' ? '#111b21' : '#ffffff' 
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Tip status trigger note */}
        <div className="text-[10px] text-gray-500 flex items-center justify-between px-1">
          <span>Tip: mention <b className="text-gray-400 hover:underline cursor-pointer" onClick={() => setInputText(prev => prev.includes('@ai') ? prev : '@ai ' + prev)}>@ai</b> anywhere in body to trigger rapid inline assistance!</span>
          {typingState && <span className="text-emerald-500 animate-pulse text-[9px] font-bold">Drafting...</span>}
        </div>
      </div>

      {/* FULL SCREEN DYNAMIC WATCH IFRAME MODAL PREVIEW */}
      {selectedWatchVideo && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#182229] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <h4 className="text-xs font-semibold text-white truncate w-3/4">
                {selectedWatchVideo.title}
              </h4>
              <button
                onClick={() => setSelectedWatchVideo(null)}
                className="p-1 px-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            
            {/* Embedded video player container */}
            <div className="aspect-video w-full bg-black flex items-center justify-center relative">
              {selectedWatchVideo.platform === 'youtube' && (selectedWatchVideo.originalUrl.includes('youtu.be') || selectedWatchVideo.originalUrl.includes('youtube.com')) ? (
                <iframe
                  src={`https://www.youtube.com/embed/${
                    selectedWatchVideo.originalUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || ''
                  }`}
                  title={selectedWatchVideo.title}
                  className="w-full h-full border-0 absolute inset-0"
                  allowFullScreen
                ></iframe>
              ) : (
                <video
                  src={selectedWatchVideo.downloadUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                  onError={() => {
                     console.warn("Raw stream lookup direct load failure");
                  }}
                />
              )}
            </div>

            <div className="p-4 bg-black/30 flex items-center justify-between text-xs font-mono">
              <span className="text-gray-400">VIA: <b className="text-[#00a884] uppercase font-bold">{selectedWatchVideo.platform}</b></span>
              <a
                href={selectedWatchVideo.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 px-4 bg-[#00a884] hover:bg-[#00c298] text-white rounded-lg font-bold select-none cursor-pointer"
              >
                SAVE VIDEO STREAM 📥
              </a>
            </div>
          </div>
        </div>
      )}

      {/* GROUP INFO & MANAGEMENT MODAL */}
      {showGroupSettings && activeChat.isGroup && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs select-none">
          <div className="w-full max-w-lg bg-[#182229] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Group Info & Settings</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{activeChat.name || 'Group Chat'}</p>
              </div>
              <button
                onClick={() => {
                  setShowGroupSettings(false);
                  setGroupActionError('');
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Contents */}
            <div className="p-6 overflow-y-auto flex flex-col gap-5">
              
              {/* Group Metadata summary */}
              <div className="text-center pb-4 border-b border-white/5 flex flex-col items-center gap-1.5">
                <div className="w-16 h-16 rounded-full bg-[#1f2c34] border border-white/10 flex items-center justify-center text-4xl shadow-md">
                  👥
                </div>
                <h4 className="font-bold text-white text-base">👥 {activeChat.name}</h4>
                <p className="text-xs text-slate-400">{activeChat.members.length} active group members</p>
              </div>

              {/* Add New Members block */}
              <div className="bg-black/15 p-4 rounded-xl border border-white/5 flex flex-col gap-2.5">
                <span className="text-[10px] text-[#00a884] font-bold uppercase tracking-wider">Add Contact to Group</span>
                <div className="flex gap-2">
                  <select
                    value={selectedAddMemberId}
                    onChange={(e) => setSelectedAddMemberId(e.target.value)}
                    className="flex-1 bg-[#111b21] border border-white/15 rounded-lg text-xs text-white p-2.5 focus:outline-none focus:border-[#00a884]"
                  >
                    <option value="">-- Choose registered friend --</option>
                    {directoryUsers
                      .filter(u => u.id !== currentUser.id && currentUser.friends?.includes(u.id) && !activeChat.members.includes(u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          @{u.username} ({u.bio || 'Friend'})
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!selectedAddMemberId}
                    className="px-4 bg-[#00a884] hover:bg-[#00c298] disabled:opacity-30 text-xs font-bold uppercase tracking-wider text-white rounded-lg transition-all cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {/* Note indicating requirements */}
                <p className="text-[10px] text-gray-500">Only contacts mutually added on Friends tab can be invited to groups.</p>
              </div>

              {/* Members Listing */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Group Members List ({activeChat.members.length})</span>
                
                {groupActionError && (
                  <p className="text-xs text-red-400 font-semibold bg-red-950/20 border border-red-500/20 p-2 rounded-lg">
                    ⚠️ {groupActionError}
                  </p>
                )}

                <div className="space-y-2 max-h-56 overflow-y-auto divide-y divide-white/5 p-1">
                  {directoryUsers
                    .filter(u => activeChat.members.includes(u.id))
                    .map((member) => {
                      const isMemberAdmin = (activeChat.admins || []).includes(member.id);
                      const isCurrentUserAdmin = (activeChat.admins || []).includes(currentUser.id);
                      const isMe = member.id === currentUser.id;

                      return (
                        <div key={member.id} className="pt-2 flex items-center justify-between border-b border-white/5 pb-2">
                          <div 
                            onClick={() => {
                              setShowGroupSettings(false);
                              if (onViewUserProfile) onViewUserProfile(member);
                            }}
                            className="flex items-center gap-2.5 cursor-pointer group flex-1 min-w-0"
                            title="Click to view full user profile card"
                          >
                            <span className="text-xl select-none shrink-0">{member.avatar || '👤'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white group-hover:text-emerald-400 truncate transition-colors flex items-center gap-1">
                                  <span>{member.username} {isMe && '(You)'}</span>
                                  <VerifiedBadge username={member.username} className="w-2.5 h-2.5" />
                                </span>
                                {isMemberAdmin && (
                                  <span className="text-[9px] text-emerald-400 font-bold bg-[#00a884]/15 border border-[#00a884]/20 py-0.5 px-2 rounded-full uppercase tracking-wider">
                                    Admin ⭐
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{member.bio || 'Avid Cortex Chat member'}</p>
                            </div>
                          </div>

                          {/* Context Admin options */}
                          {!isMe && isCurrentUserAdmin && (
                            <div className="flex items-center gap-1.5 pl-2 shrink-0">
                              {!isMemberAdmin && (
                                <button
                                  onClick={() => handlePromoteAdmin(member.id)}
                                  className="text-[9px] font-bold text-white bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/35 py-1 px-2 rounded cursor-pointer"
                                >
                                  Make Admin
                                </button>
                              )}
                              <button
                                onClick={() => handleKickMember(member.id)}
                                className="text-[9px] font-bold text-red-300 hover:text-red-100 bg-red-950/50 hover:bg-red-900 border border-red-500/20 py-1 px-2 rounded cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
