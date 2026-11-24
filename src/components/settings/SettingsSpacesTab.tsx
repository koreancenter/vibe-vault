import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { generateSecureId } from '../../identifiers';
import { getSpaces, createSpace, deleteSpace, DEFAULT_SPACE } from '../../db';
import { LedgerSpace, SupportedCurrency } from '../../types';
import { useI18n } from '../../i18n';

export interface SettingsSpacesTabProps {
  spaces?: LedgerSpace[];
  activeSpaceId?: string;
  defaultCurrency: SupportedCurrency;
  onSelectSpace?: (space: LedgerSpace) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onOpenNewSpace?: () => void;
  onDataChanged?: () => void;
  onStatusMessage?: (msg: { type: 'success' | 'error'; text: string }) => void;
}

export const SettingsSpacesTab: React.FC<SettingsSpacesTabProps> = ({
  spaces,
  activeSpaceId,
  defaultCurrency,
  onSelectSpace,
  onDeleteSpace,
  onOpenNewSpace,
  onDataChanged,
  onStatusMessage,
}) => {
  const { t, language } = useI18n();
  const [internalSpaces, setInternalSpaces] = useState<LedgerSpace[]>(spaces || [DEFAULT_SPACE]);
  const [isAddingSpace, setIsAddingSpace] = useState(false);
  const [newSpaceNameInput, setNewSpaceNameInput] = useState('');

  useEffect(() => {
    if (spaces) {
      setInternalSpaces(spaces);
    } else {
      getSpaces().then(setInternalSpaces).catch(() => {});
    }
  }, [spaces]);

  const handleSelectSpaceItem = (sp: LedgerSpace) => {
    if (onSelectSpace) {
      onSelectSpace(sp);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vibe_active_space_id', sp.id);
    }
    const msg = language === 'ko'
      ? `'${sp.name}' 장부로 전환되었습니다.`
      : `Switched to '${sp.name}' ledger.`;
    onStatusMessage?.({ type: 'success', text: msg });
  };

  const handleDeleteSpaceItem = async (spId: string) => {
    if (spId === 'default') return;
    if (onDeleteSpace) {
      onDeleteSpace(spId);
    } else {
      const confirmMsg = language === 'ko'
        ? '이 프로젝트 장부와 관련 거래 내역을 삭제하시겠습니까?'
        : 'Are you sure you want to delete this project ledger and its transactions?';
      if (!window.confirm(confirmMsg)) return;
      await deleteSpace(spId);
      setInternalSpaces(await getSpaces());
    }
    onDataChanged?.();
  };

  const handleCreateSpaceInline = async () => {
    const trimmed = newSpaceNameInput.trim();
    if (!trimmed) return;
    const newSp: LedgerSpace = {
      id: generateSecureId('space'),
      name: trimmed,
      currency: defaultCurrency || 'KRW',
      createdAt: new Date().toISOString(),
    };
    await createSpace(newSp);
    setInternalSpaces(await getSpaces());
    setNewSpaceNameInput('');
    setIsAddingSpace(false);
    onSelectSpace?.(newSp);
    onDataChanged?.();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-100">
              {t('multi_ledger_spaces')}
            </h3>
            <span className="text-xs text-neutral-200 font-mono tabular-nums">
              ({internalSpaces.length})
            </span>
          </div>
          <p className="text-xs text-neutral-200 leading-relaxed font-normal">
            {t('multi_ledger_desc')}
          </p>
        </div>

        <button
          id="btn-new-space"
          type="button"
          onClick={() => setIsAddingSpace((prev) => !prev)}
          className="text-xs px-3 py-1.5 rounded-full font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white transition-all flex items-center gap-1 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
        >
          <Plus size={12} />
          <span>{t('new_space')}</span>
        </button>
      </div>

      {isAddingSpace && (
        <div className="p-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSpaceNameInput}
              onChange={(e) => setNewSpaceNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateSpaceInline();
                }
              }}
              autoFocus
              placeholder={t('space_name_placeholder')}
              className="flex-1 bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder:text-neutral-300 focus:outline-none focus:border-white/25 transition-all"
            />
            <button
              type="button"
              onClick={() => void handleCreateSpaceInline()}
              disabled={!newSpaceNameInput.trim()}
              className="h-8 px-3.5 rounded-xl bg-white text-black hover:bg-neutral-100 active:scale-95 text-xs font-semibold transition-all disabled:bg-white/35 disabled:text-black shrink-0 cursor-pointer"
            >
              {t('create')}
            </button>
          </div>
          {onOpenNewSpace && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenNewSpace}
                className="text-xs text-neutral-200 hover:text-white font-normal transition-colors underline underline-offset-2 cursor-pointer"
              >
                {t('create_with_details')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {internalSpaces.map((sp) => {
          const isCurrent = sp.id === (activeSpaceId || 'default');
          const isDefault = sp.id === 'default';

          return (
            <div
              key={sp.id}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${
                isCurrent
                  ? 'bg-white/[0.05] border-white/15 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-neutral-100 hover:border-white/[0.12]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-medium text-xs sm:text-[13px] text-white truncate">
                  {sp.name}
                </span>
                {sp.currency && (
                  <span className="text-[10px] font-mono text-neutral-200 shrink-0">
                    · {sp.currency}
                  </span>
                )}
                {isDefault && (
                  <span className="text-[10px] text-neutral-300 font-medium shrink-0">
                    · {t('default')}
                  </span>
                )}
                {isCurrent && (
                  <span className="text-[10px] text-emerald-300 font-medium shrink-0">
                    · {t('active')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleSelectSpaceItem(sp)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white transition-all active:scale-95 cursor-pointer"
                  >
                    {t('switch')}
                  </button>
                )}
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteSpaceItem(sp.id)}
                    className="p-1.5 rounded-full text-neutral-200 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                    title={t('delete_space')}
                    aria-label={`${sp.name} ${t('delete_space')}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
