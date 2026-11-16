interface Item {
  name: string;
  count: number;
}

/** Single-series horizontal bars: value at the tip in text ink, hover title per bar. */
export function BarList({ items, label }: { items: Item[]; label: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.name} title={`${item.name}: ${item.count} ${label}`}>
          <span className="bar-label">{item.name}</span>
          <span className="bar-track">
            <span className="bar" style={{ width: `${(item.count / max) * 100}%` }} />
            <span className="bar-value">{item.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
