const cards = [
  { value: 1, label: 'Clueless', color: 'border-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40' },
  { value: 2, label: 'Shaky', color: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40' },
  { value: 3, label: 'Getting it', color: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40' },
  { value: 4, label: 'Solid', color: 'border-lime-400 bg-lime-50 dark:bg-lime-900/20 hover:bg-lime-100 dark:hover:bg-lime-900/40' },
  { value: 5, label: 'Can teach', color: 'border-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40' },
];

export default function ConfidenceCards({ value, onChange, size = 'md' }) {
  const sizing = size === 'lg' ? 'p-5' : 'p-4';
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      {cards.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={`flex flex-col items-center justify-center rounded-xl border-2 transition-all ${sizing} ${
            value === c.value
              ? `${c.color} ring-2 ring-brand-500 scale-105`
              : `${c.color} opacity-70 hover:opacity-100`
          }`}
        >
          <span className="text-2xl font-bold">{c.value}</span>
          <span className="text-xs font-medium text-center mt-1">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
