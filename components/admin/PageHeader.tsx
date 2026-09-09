export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex-none border-b border-navy/8 px-6 py-6">
      <h1 className="text-[24px] font-bold tracking-tight text-navy">{title}</h1>
      <p className="mt-1 text-[13.5px] text-charcoal/45">{subtitle}</p>
    </div>
  );
}
