import { useState, useEffect, useMemo, useCallback } from 'react';
import { LedgerSpace, SupportedCurrency, Transaction } from '../types';
import { getSpaces, createSpace, deleteSpace, DEFAULT_SPACE } from '../db';

export interface UseSpacesOptions {
  transactions: Transaction[];
  onSelectCurrency: (currency: SupportedCurrency) => void;
  onTransactionsReload: () => Promise<unknown> | void;
}

export function useSpaces({
  transactions,
  onSelectCurrency,
  onTransactionsReload,
}: UseSpacesOptions) {
  const [spaces, setSpaces] = useState<LedgerSpace[]>([DEFAULT_SPACE]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('vibe_active_space_id') || 'default';
    }
    return 'default';
  });

  const refreshSpaces = useCallback(async () => {
    try {
      const loaded = await getSpaces();
      setSpaces(loaded);
      if (!loaded.some((s) => s.id === activeSpaceId)) {
        setActiveSpaceId('default');
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('vibe_active_space_id', 'default');
        }
      }
    } catch (err) {
      console.warn('Failed to load spaces:', err);
    }
  }, [activeSpaceId]);

  useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces]);

  const activeSpace = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) || DEFAULT_SPACE,
    [spaces, activeSpaceId]
  );

  // Transactions strictly isolated to the active space
  const currentSpaceTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const sId = tx.spaceId || 'default';
        return sId === activeSpaceId;
      }),
    [transactions, activeSpaceId]
  );

  const handleSelectSpace = useCallback(
    (space: LedgerSpace) => {
      setActiveSpaceId(space.id);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vibe_active_space_id', space.id);
      }
      if (space.currency) {
        onSelectCurrency(space.currency as SupportedCurrency);
      }
    },
    [onSelectCurrency]
  );

  const handleSpaceCreated = useCallback(
    (newSpace: LedgerSpace) => {
      setSpaces((prev) => [...prev, newSpace]);
      setActiveSpaceId(newSpace.id);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vibe_active_space_id', newSpace.id);
      }
      if (newSpace.currency) {
        onSelectCurrency(newSpace.currency as SupportedCurrency);
      }
    },
    [onSelectCurrency]
  );

  const handleUpdateSpace = useCallback(async (updated: LedgerSpace) => {
    await createSpace(updated);
    setSpaces((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleDeleteSpace = useCallback(
    async (spaceId: string) => {
      if (spaceId === 'default') return;
      if (!window.confirm('이 프로젝트 장부와 관련 거래 내역을 삭제하시겠습니까?')) return;
      try {
        await deleteSpace(spaceId);
        setSpaces((prev) => prev.filter((s) => s.id !== spaceId));
        if (activeSpaceId === spaceId) {
          setActiveSpaceId('default');
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vibe_active_space_id', 'default');
          }
        }
        await onTransactionsReload();
      } catch (err) {
        console.error('Failed to delete space:', err);
      }
    },
    [activeSpaceId, onTransactionsReload]
  );

  return {
    spaces,
    activeSpaceId,
    activeSpace,
    currentSpaceTransactions,
    refreshSpaces,
    handleSelectSpace,
    handleSpaceCreated,
    handleUpdateSpace,
    handleDeleteSpace,
  };
}
