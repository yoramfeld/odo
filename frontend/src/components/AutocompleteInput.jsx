import { useState, useRef } from 'react';

export default function AutocompleteInput({ value, onChange, suggestions = [], placeholder, className, ...props }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const vpHandler = useRef(null);

  const filtered = suggestions.filter(s =>
    s !== value && (value === '' || s.includes(value))
  );

  function scrollIntoView() {
    wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleFocus() {
    setOpen(true);
    vpHandler.current = scrollIntoView;
    window.visualViewport?.addEventListener('resize', scrollIntoView);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
    if (vpHandler.current) {
      window.visualViewport?.removeEventListener('resize', vpHandler.current);
      vpHandler.current = null;
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
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
