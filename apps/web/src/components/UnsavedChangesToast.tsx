'use client';

interface UnsavedChangesToastProps {
  visible: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
}

export function UnsavedChangesToast({ visible, onSave, onDiscard, saving }: UnsavedChangesToastProps) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'var(--card-bg)',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: 12,
      boxShadow: '0 8px 24px var(--shadow-md)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      zIndex: 50,
      fontSize: 14,
    }}>
      <span>You have unsaved changes</span>
      <button
        onClick={onDiscard}
        disabled={saving}
        style={{
          padding: '6px 14px',
          backgroundColor: 'transparent',
          color: 'var(--text-placeholder)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Discard
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: '6px 14px',
          backgroundColor: 'var(--accent-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  );
}
