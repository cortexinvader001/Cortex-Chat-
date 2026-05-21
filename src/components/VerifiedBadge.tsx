import React from 'react';
import { Check } from 'lucide-react';
import { DEV_VERIFIED_USERNAMES } from '../types';

interface VerifiedBadgeProps {
  username?: string;
  className?: string;
}

export default function VerifiedBadge({ username, className = "w-3 h-3" }: VerifiedBadgeProps) {
  if (!username) return null;
  
  const cleanUsername = username.trim().toLowerCase();
  const isDev = DEV_VERIFIED_USERNAMES.some(dev => dev.toLowerCase() === cleanUsername) ||
                 cleanUsername === 'cortex' ||
                 cleanUsername.includes('cortex') ||
                 cleanUsername === 'developer' ||
                 cleanUsername === 'admin' ||
                 cleanUsername === 'dev';
                 
  if (!isDev) return null;

  return (
    <span 
      className="inline-flex items-center justify-center bg-[#007aff] text-white rounded-full p-[1.5px] ml-1 shrink-0 select-none shadow-sm align-middle" 
      title="Verified Developer Account"
    >
      <Check className={`${className} stroke-[5]`} />
    </span>
  );
}
