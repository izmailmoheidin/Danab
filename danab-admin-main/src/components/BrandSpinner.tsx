"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";

interface BrandSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export default function BrandSpinner({ size = "md", label }: BrandSpinnerProps) {
  const sizeMap = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  const iconSizeMap = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-2xl",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`relative ${sizeMap[size]} flex items-center justify-center`}>
        {/* Outer Purple Spinning Ring */}
        <div className="absolute inset-0 rounded-full border-2 border-[#7C3AED]/10 border-t-[#7C3AED] animate-spin shadow-[0_0_15px_rgba(124,58,237,0.2)]" />
        
        {/* Middle Green Pulsing Bolt */}
        <div className="relative z-10 animate-pulse text-[#10B981] drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
           <FontAwesomeIcon icon={faBolt} className={iconSizeMap[size]} />
        </div>
      </div>
      
      {label && (
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
}
