import { useState } from 'react';

export default function AutocompleteInput({ value, onChange, suggestions = [], placeholder, className, ...props }) {
  const [open, setOpen] = useState(false);

  const filtered = suggestions.filter(s =>
    s !== value && (value === '' || s.includes(value))
  );

  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        {...props}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 w-full bg-slate-900 border border-slate-700 rounded-xl mt-1 overflow-hidden shadow-xl">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => { onChange(s); setOpen(false); }}
              className="w-full text-right px-4 py-2.5 text-sm text-white hover:bg-slate-800 block"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
