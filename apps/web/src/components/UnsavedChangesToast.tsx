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
      backgroundColor: '#1e293b',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
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
          color: '#94a3b8',
          border: '1px solid #475569',
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
          backgroundColor: '#2563eb',
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
