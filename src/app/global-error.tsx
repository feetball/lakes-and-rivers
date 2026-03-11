'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#eff6ff',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
            <h2 style={{ fontSize: 20, color: '#1f2937', marginBottom: 8 }}>
              Application Error
            </h2>
            <p style={{ color: '#6b7280', marginBottom: 24 }}>
              A critical error occurred. Please reload the page.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: '8px 24px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
