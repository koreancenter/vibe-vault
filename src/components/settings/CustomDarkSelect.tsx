import React, { useRef, useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (val: string) => void;
  id?: string;
  className?: string;
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md';
  showSublabelInTrigger?: boolean;
}

export const CustomDarkSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  options, 
  onChange, 
  id, 
  className = '', 
  theme = 'dark',
  size = 'md',
  showSublabelInTrigger = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isLight = theme === 'light';
  const isSm = size === 'sm';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left rounded-xl text-xs flex items-center justify-between transition-all focus:outline-none active:scale-[0.99] ${
          isSm ? 'px-2.5 py-1.5 rounded-lg' : 'px-3.5 py-2.5 rounded-xl'
        } ${
          isLight
            ? 'bg-white border border-slate-300 hover:border-slate-400 text-slate-900 shadow-xs'
            : 'bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-slate-100'
        }`}
      >
        <span className="truncate font-medium">
          {selectedOption?.label}
          {showSublabelInTrigger && selectedOption?.sublabel && (
            <span className={`text-[11px] ml-2 font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {selectedOption.sublabel}
            </span>
          )}
        </span>
        <ChevronDown 
          size={isSm ? 12 : 14} 
          className={`transition-transform duration-200 shrink-0 ml-1 ${
            isLight ? 'text-slate-500' : 'text-neutral-400'
          } ${isOpen ? 'rotate-180 text-white' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className={`absolute right-0 min-w-full top-full mt-1 backdrop-blur-md rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto py-1 animate-in fade-in zoom-in-95 duration-150 scrollbar-none ${
          isLight
            ? 'bg-white border border-slate-300 text-slate-800'
            : 'bg-[#111217] border border-white/10 text-white'
        }`}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left text-xs flex items-center justify-between transition-colors ${
                  isSm ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'
                } ${
                  isSelected 
                    ? isLight
                      ? 'bg-neutral-100 text-black font-semibold'
                      : 'bg-white/10 text-white font-medium' 
                    : isLight
                      ? 'text-slate-800 hover:bg-slate-100 hover:text-slate-950'
                      : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <div className="truncate pr-2">
                  <span className="block truncate font-medium">{opt.label}</span>
                  {opt.sublabel && (
                    <span className={`text-[11px] block truncate font-normal ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
                      {opt.sublabel}
                    </span>
                  )}
                </div>
                {isSelected && <Check size={isSm ? 12 : 14} className={isLight ? 'text-black shrink-0' : 'text-white shrink-0'} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
