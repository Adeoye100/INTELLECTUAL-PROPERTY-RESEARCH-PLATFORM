/**
 * MatterSelectionModal.tsx
 *
 * Modal for saving a risk result to an existing matter or creating a new one.
 *
 * ⚠️  MOCK-ONLY: All persistence is handled by the matterAdapter which writes
 * to localStorage only. No server state is modified. A disclaimer is shown to
 * the user whenever a save completes successfully.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle, FolderOpen, FolderPlus, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { matterAdapter } from './matterAdapter';
import type { Matter, MatterSaveRequest } from '../../types';
import { cn } from '../../lib/utils';

interface MatterSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  saveRequest: Omit<MatterSaveRequest, 'matterId' | 'newMatterName' | 'newMatterClientRef'>;
  onSaved: (matter: Matter, created: boolean) => void;
}

type ModalView = 'list' | 'create';

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; matter: Matter; created: boolean }
  | { status: 'error'; message: string };

export const MatterSelectionModal: React.FC<MatterSelectionModalProps> = ({
  isOpen,
  onClose,
  saveRequest,
  onSaved,
}) => {
  const [view, setView] = useState<ModalView>('list');
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loadingMatters, setLoadingMatters] = useState(false);
  const [newMatterName, setNewMatterName] = useState('');
  const [newMatterClientRef, setNewMatterClientRef] = useState('');
  const [nameError, setNameError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  // Load matters list when modal opens.
  // State resets are deferred via a mounted-flag so they don't run synchronously
  // inside the effect body, avoiding the cascading-render lint rule.
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    Promise.resolve().then(() => {
      if (!mounted) return;
      setView('list');
      setSaveState({ status: 'idle' });
      setNewMatterName('');
      setNewMatterClientRef('');
      setNameError('');
      setLoadingMatters(true);
    });

    matterAdapter
      .listMatters()
      .then((data) => { if (mounted) setMatters(data); })
      .catch(() => { if (mounted) setMatters([]); })
      .finally(() => { if (mounted) setLoadingMatters(false); });

    return () => { mounted = false; };
  }, [isOpen]);

  const handleSelectExisting = async (matter: Matter) => {
    if (saveState.status === 'saving') return;
    setSaveState({ status: 'saving' });
    try {
      const result = await matterAdapter.saveToMatter({ ...saveRequest, matterId: matter.id });
      setSaveState({ status: 'success', matter: result.matter, created: false });
      onSaved(result.matter, false);
    } catch (err) {
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to save to matter.',
      });
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatterName.trim()) {
      setNameError('Matter name is required.');
      return;
    }
    setNameError('');
    if (saveState.status === 'saving') return;
    setSaveState({ status: 'saving' });
    try {
      const result = await matterAdapter.saveToMatter({
        ...saveRequest,
        newMatterName: newMatterName.trim(),
        newMatterClientRef: newMatterClientRef.trim(),
      });
      setSaveState({ status: 'success', matter: result.matter, created: true });
      onSaved(result.matter, true);
    } catch (err) {
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to create matter.',
      });
    }
  };

  const isSaving = saveState.status === 'saving';
  const isDone = saveState.status === 'success';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Save to matter"
      footer={
        isDone ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {/* Mock disclaimer — always visible */}
        <div className="flex items-start gap-2 rounded border border-risk-medium/40 bg-risk-medium/10 p-3 text-sm text-risk-medium">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <p>
            <strong>Development mode:</strong> Matter state is stored in this browser only.
            No server persistence exists yet — saves will be lost on clearing browser storage.
          </p>
        </div>

        {/* Success state */}
        {saveState.status === 'success' && (
          <div className="flex items-start gap-3 rounded border border-forge-teal-700/40 bg-forge-teal-700/10 p-4">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-forge-teal-700" aria-hidden="true" />
            <div>
              <p className="font-bold text-text-primary">
                {saveState.created ? 'New matter created and result saved.' : 'Result saved to matter.'}
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Matter: <span className="font-semibold">{saveState.matter.name}</span>
                {saveState.matter.clientRef && (
                  <> &mdash; Ref: <span className="font-mono">{saveState.matter.clientRef}</span></>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {saveState.status === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded border border-risk-high/40 bg-risk-high/10 p-3 text-sm text-risk-high"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">Save failed</p>
              <p>{saveState.message}</p>
              <button
                className="mt-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setSaveState({ status: 'idle' })}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!isDone && saveState.status !== 'error' && (
          <>
            {/* Tab switcher */}
            <div className="flex gap-2 border-b border-forge-silver-300">
              <button
                className={cn(
                  'flex items-center gap-1.5 pb-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  view === 'list'
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-text-secondary hover:text-text-primary',
                )}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Existing matters
              </button>
              <button
                className={cn(
                  'flex items-center gap-1.5 pb-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  view === 'create'
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-text-secondary hover:text-text-primary',
                )}
                onClick={() => setView('create')}
                aria-pressed={view === 'create'}
              >
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                Create new matter
              </button>
            </div>

            {/* Existing matters list */}
            {view === 'list' && (
              <div className="space-y-2">
                {loadingMatters ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-text-secondary" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading matters…
                  </div>
                ) : matters.length === 0 ? (
                  <p className="py-4 text-sm text-text-secondary">
                    No matters found.{' '}
                    <button
                      className="font-semibold text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => setView('create')}
                    >
                      Create your first matter.
                    </button>
                  </p>
                ) : (
                  matters.map((matter) => (
                    <button
                      key={matter.id}
                      className="flex w-full items-start justify-between gap-4 rounded border border-forge-silver-300 p-3 text-left transition-colors hover:bg-surface-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                      onClick={() => handleSelectExisting(matter)}
                      disabled={isSaving}
                    >
                      <div>
                        <p className="font-semibold text-text-primary">{matter.name}</p>
                        {matter.clientRef && (
                          <p className="text-xs font-mono text-text-secondary">{matter.clientRef}</p>
                        )}
                        <p className="text-xs text-text-secondary">
                          {matter.savedResultIds.length} saved result
                          {matter.savedResultIds.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {isSaving ? (
                        <Loader2 className="mt-1 h-4 w-4 flex-shrink-0 animate-spin text-accent" aria-hidden="true" />
                      ) : (
                        <span className="mt-1 text-xs font-semibold text-accent">Save here →</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Create new matter form */}
            {view === 'create' && (
              <form onSubmit={handleCreateNew} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="new-matter-name" className="mb-1 block text-xs font-bold uppercase text-text-secondary">
                    Matter name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="new-matter-name"
                    value={newMatterName}
                    onChange={(e) => {
                      setNewMatterName(e.target.value);
                      if (nameError) setNameError('');
                    }}
                    className={cn(
                      'w-full rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
                      nameError ? 'border-risk-high' : 'border-forge-silver-300',
                    )}
                    placeholder="e.g. Q3 Clearance — FORGE GLOBAL"
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? 'new-matter-name-error' : undefined}
                    disabled={isSaving}
                  />
                  {nameError && (
                    <p id="new-matter-name-error" className="mt-1 text-xs text-risk-high" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="new-matter-ref" className="mb-1 block text-xs font-bold uppercase text-text-secondary">
                    Client reference (optional)
                  </label>
                  <input
                    id="new-matter-ref"
                    value={newMatterClientRef}
                    onChange={(e) => setNewMatterClientRef(e.target.value)}
                    className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                    placeholder="e.g. FG-2026-Q3"
                    disabled={isSaving}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Creating matter…
                    </>
                  ) : (
                    'Create matter and save result'
                  )}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
