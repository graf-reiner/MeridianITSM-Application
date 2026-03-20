import AdminNav from '../../components/AdminNav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <AdminNav />
      <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
