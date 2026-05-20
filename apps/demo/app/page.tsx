import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '4rem 2rem' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>SketchBoard</h1>
      <p style={{ color: '#aaa', marginBottom: '3rem', lineHeight: 1.6 }}>
        Open-source infinite canvas drawing &amp; animation engine for the web.
        Framework-agnostic core with React bindings.
      </p>

      <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <DemoCard
          href="/canvas"
          title="Drawing Canvas"
          description="Pressure-sensitive brush, eraser, pan & zoom"
        />
        <DemoCard
          href="/canvas#animation"
          title="Animation"
          description="Keyframe timeline, easing, nested compositions"
        />
      </section>

      <footer style={{ marginTop: '4rem', color: '#555', fontSize: '0.85rem' }}>
        MIT License · Built with @sketchboard/core
      </footer>
    </main>
  )
}

function DemoCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '1.5rem',
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s',
      }}
    >
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{title}</h2>
      <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: 1.5 }}>{description}</p>
    </Link>
  )
}
