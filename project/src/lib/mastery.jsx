export function masteryColor(score) {
  if (score <= 40) return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500', label: 'Low' };
  if (score <= 70) return { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', label: 'Medium' };
  return { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500', label: 'High' };
}

export function MasteryBadge({ score, size = 'sm' }) {
  const c = masteryColor(score);
  const sizes = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${c.bg} ${c.text} ${sizes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {score}%
    </span>
  );
}
