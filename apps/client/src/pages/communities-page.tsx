function TabPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-8">
      <div className="w-full max-w-4xl rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
          Tab
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-white">{title}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          {description}
        </p>
      </div>
    </section>
  );
}

export function CommunitiesPage() {
  return (
    <TabPage
      title="Communities"
      description="This tab is reserved for community and group discovery."
    />
  );
}

export default CommunitiesPage;
