// Shared types & sub-components for Settings page
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export function CfgSelect({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; disabled?: boolean;
}) {
  return (
    <div className="cfg-field">
      <span className="cfg-field__label">{label}</span>
      <select className="cfg-field__select" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function CfgToggle({ label, sub, value, onChange, disabled }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="cfg-toggle-row">
      <div className="cfg-toggle-row__text">
        <div>
          <div className="cfg-toggle-row__label">{label}</div>
          {sub && <div className="cfg-toggle-row__sub">{sub}</div>}
        </div>
      </div>
      <button type="button" className={`policy-toggle ${value ? "policy-toggle--on" : ""}`}
        disabled={disabled} onClick={() => onChange(!value)} aria-pressed={value}>
        <span className="policy-toggle__thumb" />
      </button>
    </div>
  );
}

export function CfgInput({ label, value, onChange, placeholder, disabled, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; type?: string;
}) {
  return (
    <div className="cfg-field">
      <span className="cfg-field__label">{label}</span>
      <input className="cfg-field__input" type={type} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
    </div>
  );
}

export function CfgAccordion({ id, title, icon, color, bg, children, defaultOpen = false }: {
  id: string; title: string; icon: React.ReactNode; color: string; bg: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cfg-accordion" id={`section-${id}`}>
      <button type="button" className="cfg-accordion__head" onClick={() => setOpen(v => !v)}>
        <div className="cfg-accordion__icon-wrap" style={{ background: bg }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="cfg-accordion__title">{title}</span>
        <span className="cfg-accordion__chevron">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open && <div className="cfg-accordion__body">{children}</div>}
    </div>
  );
}

export function CfgRow({ children }: { children: React.ReactNode }) {
  return <div className="cfg-2col">{children}</div>;
}

export function CfgSaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="cfg-save-bar">
      <button className="cfg-save-btn" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
