export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex-none border-b-2 border-navy/6 px-6 py-5">
      <h1 className="text-[19px] font-bold tracking-tight text-navy">{title}</h1>
      <p className="mt-0.5 text-[13px] text-charcoal/55">{subtitle}</p>
    </div>
  );
}
