import { useState, useCallback } from 'react';
import { Transaction } from '../types';

export type SettingsTabKey = 'assets' | 'spaces' | 'engine' | 'preferences' | 'privacy';
export type SettingsSubTabKey = 'assets' | 'budget' | 'subscriptions';

const VALID_SETTINGS_TABS: SettingsTabKey[] = ['assets', 'spaces', 'engine', 'preferences', 'privacy'];
const CHANGELOG_VERSION = '0.1.2';

export interface UseWorkspaceModalsOptions {
  onSyncPreferences: () => void;
  onOpenWelcome?: () => void;
}

export function useWorkspaceModals({
  onSyncPreferences,
  onOpenWelcome,
}: UseWorkspaceModalsOptions) {
  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabKey>('assets');
  const [settingsInitialSubTab, setSettingsInitialSubTab] = useState<SettingsSubTabKey>('assets');

  // New Space Modal & Settings return-flow state
  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState(false);

  // Event Settlement Report Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Changelog Modal & unread indicator
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [hasUnreadChangelog, setHasUnreadChangelog] = useState(
    () =>
      typeof localStorage === 'undefined' ||
      localStorage.getItem('vibe_changelog_seen_version') !== CHANGELOG_VERSION
  );

  // Receipt Scanner Modal
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Transaction Action / Edit / Manual Category Modals
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedActionTransaction, setSelectedActionTransaction] = useState<Transaction | null>(null);
  const [pendingCategorizationTxs, setPendingCategorizationTxs] = useState<Transaction[]>([]);

  // Guest Exit Confirmation Modal
  const [isGuestExitModalOpen, setIsGuestExitModalOpen] = useState<boolean>(false);

  // Settings handlers
  const openSettingsModal = useCallback((tab?: unknown, subTab?: SettingsSubTabKey) => {
    const resolvedTab: SettingsTabKey =
      typeof tab === 'string' && (VALID_SETTINGS_TABS as string[]).includes(tab)
        ? (tab as SettingsTabKey)
        : 'assets';
    setSettingsInitialTab(resolvedTab);
    setSettingsInitialSubTab(subTab || 'assets');
    setIsSettingsOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setIsSettingsOpen(false);
    onSyncPreferences();
  }, [onSyncPreferences]);

  // NewSpaceModal -> SettingsModal('spaces') return flow
  const openNewSpaceFromSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setIsNewSpaceModalOpen(true);
  }, []);

  const closeNewSpaceModal = useCallback(() => {
    setIsNewSpaceModalOpen(false);
    setSettingsInitialTab('spaces');
    setIsSettingsOpen(true);
  }, []);

  // Changelog handlers
  const openChangelogModal = useCallback(() => {
    setIsChangelogOpen(true);
    setHasUnreadChangelog(false);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vibe_changelog_seen_version', CHANGELOG_VERSION);
      } catch {
        // Ignore storage quota or private mode restrictions
      }
    }
  }, []);

  const closeChangelogModal = useCallback(() => setIsChangelogOpen(false), []);

  // Receipt Scanner handlers
  const openReceiptModal = useCallback(() => setIsReceiptModalOpen(true), []);
  const closeReceiptModal = useCallback(() => setIsReceiptModalOpen(false), []);

  // Event Settlement Report handlers
  const openReportModal = useCallback(() => setIsReportModalOpen(true), []);
  const closeReportModal = useCallback(() => setIsReportModalOpen(false), []);

  // Transaction Action & Edit handlers
  const closeActionModal = useCallback(() => setSelectedActionTransaction(null), []);
  const openEditFromAction = useCallback((tx: Transaction) => {
    setSelectedActionTransaction(null);
    setEditingTransaction(tx);
  }, []);
  const closeEditModal = useCallback(() => setEditingTransaction(null), []);
  const cancelCategorization = useCallback(() => setPendingCategorizationTxs([]), []);

  // Guest Exit handlers
  const openGuestExitModal = useCallback(() => setIsGuestExitModalOpen(true), []);
  const closeGuestExitModal = useCallback(() => setIsGuestExitModalOpen(false), []);
  const openPinSetupFromGuestExit = useCallback(() => {
    setIsGuestExitModalOpen(false);
    openSettingsModal('privacy');
  }, [openSettingsModal]);

  // Welcome modal trigger
  const openWelcomeModal = useCallback(() => {
    onOpenWelcome?.();
  }, [onOpenWelcome]);

  // Vault lock cleanup
  const closeModalsOnVaultLock = useCallback(() => {
    setIsSettingsOpen(false);
    setIsGuestExitModalOpen(false);
    onOpenWelcome?.();
  }, [onOpenWelcome]);

  return {
    // Welcome
    openWelcomeModal,
    // Settings
    isSettingsOpen,
    settingsInitialTab,
    settingsInitialSubTab,
    openSettingsModal,
    closeSettingsModal,
    // New Space return flow
    isNewSpaceModalOpen,
    openNewSpaceFromSettings,
    closeNewSpaceModal,
    // Report
    isReportModalOpen,
    openReportModal,
    closeReportModal,
    // Changelog
    isChangelogOpen,
    hasUnreadChangelog,
    openChangelogModal,
    closeChangelogModal,
    // Receipt Scanner
    isReceiptModalOpen,
    openReceiptModal,
    closeReceiptModal,
    // Transaction modals
    editingTransaction,
    setEditingTransaction,
    closeEditModal,
    selectedActionTransaction,
    setSelectedActionTransaction,
    closeActionModal,
    openEditFromAction,
    pendingCategorizationTxs,
    setPendingCategorizationTxs,
    cancelCategorization,
    // Guest Exit
    isGuestExitModalOpen,
    openGuestExitModal,
    closeGuestExitModal,
    openPinSetupFromGuestExit,
    // Lock cleanup
    closeModalsOnVaultLock,
  };
}
