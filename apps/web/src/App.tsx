import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './api/health';
import { fr } from './i18n';

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold">{fr.app.title}</h1>
        <p className="text-gray-600">{fr.app.subtitle}</p>
      </header>
      <section className="rounded-lg border p-4">
        {health.isPending && <p>{fr.health.loading}</p>}
        {health.isError && <p className="text-red-600">{fr.health.error}</p>}
        {health.isSuccess && (
          <p className="text-green-700">
            {fr.health.ok} · {fr.health.version} {health.data.version}
          </p>
        )}
      </section>
    </main>
  );
}
