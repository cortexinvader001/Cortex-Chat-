import { useState } from 'react';
import { User } from '../types';
import { X, Check } from 'lucide-react';
import VerifiedBadge from './VerifiedBadge';
import { apiFetch as fetch } from '../utils/api';

interface ProfileViewerProps {
  user: User; // User being viewed
  isSelf: boolean; // Is this the current logged in user?
  token: string;
  onClose: () => void;
  onProfileUpdated?: (updatedUser: User) => void;
}

const PRESET_AVATARS = ['😎', '🤓', '🦁', '🥑', '🍕', '🐱', '🦄', '🐳', '🍀', '✨', '🦊', '🦉', '🛸', '🎯', '🎸', '🎨', '🚀'];

export default function ProfileViewer({
  user,
  isSelf,
  token,
  onClose,
  onProfileUpdated
}: ProfileViewerProps) {
  const [bio, setBio] = useState(user.bio || '');
  const [avatar, setAvatar] = useState(user.avatar || '👤');
  const [isPublicState, setIsPublicState] = useState(user.isPublic === true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  const handleSave = async () => {
    if (!bio.trim()) {
      setErrorText('Biography status cannot be empty.');
      return;
    }
    setErrorText('');
    setSuccessText('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bio: bio.substring(0, 100), avatar, isPublic: isPublicState })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessText('Profile successfully updated!');
        if (onProfileUpdated) onProfileUpdated(data.user);
        setTimeout(() => onClose(), 1200);
      } else {
        setErrorText(data.error || 'Failed to update profile.');
      }
    } catch (err) {
      setErrorText('Error updating profile profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#182229] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1">
            <span>{isSelf ? 'My Profile Settings' : `${user.username}'s Profile`}</span>
            <VerifiedBadge username={user.username} className="w-3.5 h-3.5" />
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col items-center gap-6 overflow-y-auto max-h-[80vh]">
          
          {/* Avatar Area */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-[#202c33] flex items-center justify-center text-5xl border border-white/10 shadow-lg relative">
              {avatar}
              {!isSelf && user.isOnline && (
                <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 border-4 border-[#121b22] animate-pulse"></span>
              )}
            </div>
            
            <p className="font-bold text-lg text-white flex items-center justify-center gap-0.5">
              <span>@{user.username}</span>
              <VerifiedBadge username={user.username} className="w-4 h-4" />
            </p>
            {!isSelf && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                user.isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
              }`}>
                {user.isOnline ? '● Online Now' : 'Offline'}
              </span>
            )}
          </div>

          {/* Self Editing Panel */}
          {isSelf ? (
            <div className="w-full flex flex-col gap-4">
              
              {/* Avatar Selector Presets */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Choose Avatar Emoji</label>
                <div className="flex flex-wrap gap-2 p-2.5 bg-black/15 rounded-xl border border-white/5 justify-center max-h-32 overflow-y-auto">
                  {PRESET_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setAvatar(emoji)}
                      className={`text-2xl p-1.5 rounded-lg hover:bg-white/10 transition-all cursor-pointer ${
                        avatar === emoji ? 'bg-white/20 scale-110 shadow-md border border-[#00a884]' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                  <div className="w-full mt-2">
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="Or enter custom character/emoji..."
                      value={avatar}
                      onChange={(e) => setAvatar(e.target.value.substring(0, 2))}
                      className="w-full bg-[#111b21] border border-white/10 rounded-lg p-1.5 px-3 text-xs text-center text-white focus:outline-none focus:border-[#00a884]"
                    />
                  </div>
                </div>
              </div>

              {/* Status Bio Form */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Biography Status (limit 100)</label>
                <textarea
                  maxLength={100}
                  rows={2}
                  placeholder="Tell others what you are up to..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-black/20 text-xs text-white placeholder-gray-600 rounded-xl p-3 border border-white/10 focus:outline-none focus:border-[#00a884] resize-none"
                />
                <span className="text-[10px] text-gray-500 self-end">{bio.length}/100</span>
              </div>

              {/* Privacy Setting Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-black/25 rounded-xl border border-white/5 gap-4">
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-white uppercase tracking-wider">Public Profile DM Mode</span>
                  <span className="block text-[10px] text-gray-400 mt-1 leading-normal">
                    {isPublicState 
                      ? "Anyone can search and start direct chats with you without being authorized."
                      : "Only accepted friends can DM you. Strangers will be gated."
                    }
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublicState(!isPublicState)}
                  className={`w-12 h-6 rounded-full p-0.5 transition-all duration-300 select-none cursor-pointer flex items-center shrink-0 ${
                    isPublicState ? 'bg-[#00a884] justify-end' : 'bg-gray-700 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-transform"></span>
                </button>
              </div>

              {/* Status Notifications */}
              {errorText && <p className="text-xs text-red-400 font-medium">⚠️ {errorText}</p>}
              {successText && <p className="text-xs text-emerald-400 font-medium">✅ {successText}</p>}

              {/* Action buttons */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-2.5 bg-[#00a884] hover:bg-[#00c298] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer select-none active:scale-[0.99]"
              >
                {isSaving ? 'Saving profile changes...' : 'Save Settings'}
              </button>
            </div>
          ) : (
            /* Other User details sheet */
            <div className="w-full flex flex-col gap-4">
              
              <div className="flex flex-col gap-1 bg-black/15 p-4 rounded-xl border border-white/5">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Biography / Status</span>
                <p className="text-xs leading-relaxed text-gray-200 mt-1 whitespace-pre-wrap">{user.bio || 'Hey there! I am using Cortex Chat.'}</p>
              </div>

              <div className="flex justify-between items-center text-xs py-2 border-b border-white/5 px-1 bg-black/5 rounded-lg">
                <span className="text-gray-500">Contact Added</span>
                <span className="text-gray-300 font-medium">{new Date(user.createdAt || '').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>

              <div className="flex justify-between items-center text-xs py-2 border-b border-white/5 px-1 bg-black/5 rounded-lg">
                <span className="text-gray-500">Friendship Rating</span>
                <span className="text-emerald-400 font-bold">MUTUAL CONTACT</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
