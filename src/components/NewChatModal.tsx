import React, { useState, useEffect } from 'react';
import { User, AppTheme } from '../types';
import { THEMES } from '../theme';
import { X, Search, Users, Check, MessageSquarePlus } from 'lucide-react';
import VerifiedBadge from './VerifiedBadge';
import { apiFetch as fetch } from '../utils/api';

interface NewChatModalProps {
  currentTheme: AppTheme;
  token: string;
  onClose: () => void;
  onChatCreated: (chat: any) => void;
}

export default function NewChatModal({ currentTheme, token, onClose, onChatCreated }: NewChatModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch all directory users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) {
          setUsers(data.users || []);
        } else {
          setErrorStatus(data.error || 'Failed to retrieve directory.');
        }
      } catch (err) {
        setErrorStatus('Failed to connect to directory list.');
      }
    };
    fetchUsers();
  }, [token]);

  // Construct filtered users according to search query
  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const toggleUserSelection = (uId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uId) ? prev.filter((id) => id !== uId) : [...prev, uId]
    );
  };

  const handleStartConversation = async (directUserId?: string) => {
    setLoading(true);
    setErrorStatus(null);

    const members = directUserId ? [directUserId] : selectedUserIds;
    const isGroup = directUserId ? false : isGroupMode;

    if (isGroup && !groupName.trim()) {
      setErrorStatus('Please provide a Group Chat Name.');
      setLoading(false);
      return;
    }

    if (isGroup && members.length === 0) {
      setErrorStatus('Please select at least one group member.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          members,
          isGroup,
          name: isGroup ? groupName.trim() : undefined,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        onChatCreated(data.chat);
        onClose();
      } else {
        setErrorStatus(data.error || 'Failed to build conversation.');
      }
    } catch (err) {
      setErrorStatus('Connection state error building chat.');
    } finally {
      setLoading(false);
    }
  };

  const activeTheme = THEMES[currentTheme];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md bg-[#111b21] border border-white/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 ${activeTheme.glowClass}`}>
        
        {/* Modal Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#121b22]">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-gray-400" style={{ color: activeTheme.accentHex }} />
            <h2 className="font-semibold text-white">Start Chat</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create Mode Toggle */}
        <div className="p-3 bg-white/5 border-b border-white/5 flex gap-2">
          <button
            onClick={() => {
              setIsGroupMode(false);
              setSelectedUserIds([]);
              setGroupName('');
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all text-center ${
              !isGroupMode
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            One-to-One Chat
          </button>
          <button
            onClick={() => setIsGroupMode(true)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
              isGroupMode
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Group Chat
          </button>
        </div>

        {/* error Status Banner */}
        {errorStatus && (
          <div className="p-3 bg-red-950/40 border-b border-red-500/20 text-red-200 text-xs text-center font-medium">
            ⚠️ {errorStatus}
          </div>
        )}

        {/* Group Name Section */}
        {isGroupMode && (
          <div className="p-4 border-b border-white/5 bg-white/5 space-y-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Group Name</label>
            <input
              type="text"
              placeholder="e.g. Design Sync Group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-[#202c33] text-sm text-white border border-white/5 rounded-xl px-4 py-2.5 placeholder-gray-500 focus:outline-none focus:border-gray-500"
            />
          </div>
        )}

        {/* Directory Search */}
        <div className="p-3 border-b border-white/5 bg-[#121b22] flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder={isGroupMode ? "Search and select members..." : "Search registered contacts..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-gray-500"
          />
        </div>

        {/* Users List */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/5 bg-[#111b21] min-h-[250px] max-h-[350px]">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              No contacts found dynamically. Invite users!
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <div
                  key={user.id}
                  onClick={() => {
                    if (isGroupMode) {
                      toggleUserSelection(user.id);
                    } else {
                      handleStartConversation(user.id);
                    }
                  }}
                  className="p-3.5 flex items-center justify-between hover:bg-[#202c33]/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#202c33] flex items-center justify-center text-xl shrink-0 border border-white/5">
                      {user.avatar || '👤'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white text-sm truncate flex items-center gap-1.5">
                        <span>{user.username}</span>
                        <VerifiedBadge username={user.username} className="w-2.5 h-2.5" />
                        {user.isOnline && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#111b21]"></span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 capitalize">
                        {user.theme.replace('dark-', '')} theme preferred
                      </div>
                    </div>
                  </div>

                  {/* Selector visuals */}
                  {isGroupMode && (
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-white/20 hover:border-white/40'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Prompt Group Builder Action Footer */}
        {isGroupMode && (
          <div className="p-4 border-t border-white/5 bg-[#121b22] flex items-center justify-between">
            <div className="text-xs text-gray-400 font-medium">
              {selectedUserIds.length} candidate{selectedUserIds.length !== 1 && 's'} chosen
            </div>
            <button
              onClick={() => handleStartConversation()}
              disabled={loading || selectedUserIds.length === 0}
              className={`py-2 px-5 font-semibold text-xs rounded-xl transition-all ${
                loading || selectedUserIds.length === 0
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'hover:opacity-90'
              }`}
              style={{
                backgroundColor: selectedUserIds.length > 0 ? activeTheme.accentHex : undefined,
                color: selectedUserIds.length > 0 && currentTheme === 'dark-white' ? '#111b21' : '#ffffff',
              }}
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
