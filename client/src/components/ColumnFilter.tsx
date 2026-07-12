import React, { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "../lib/utils";

export interface FilterOption { value: string; label: string; group?: string }

interface Props {
  title: string;                 // 팝오버 상단 제목
  options: FilterOption[];       // 전체 선택지
  selected: string[];            // 선택된 value 목록 (빈 배열 = 필터 없음(전체))
  onChange: (next: string[]) => void;
}

/** 엑셀식 컬럼 필터 — 깔때기 버튼 → 검색 + 전체선택/해제 + 체크박스 목록.
 *  선택이 비어있으면 "필터 없음"으로 간주(전체 표시). */
export function ColumnFilter({ title, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.group ?? "").toLowerCase().includes(q));
  }, [options, search]);

  // 그룹 순서 유지하며 그룹핑
  const groupedList = useMemo(() => {
    const out: { group: string | undefined; items: FilterOption[] }[] = [];
    for (const o of visible) {
      const last = out[out.length - 1];
      if (last && last.group === o.group) last.items.push(o);
      else out.push({ group: o.group, items: [o] });
    }
    return out;
  }, [visible]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  function selectAllVisible() {
    const vals = visible.map((o) => o.value);
    onChange(Array.from(new Set([...selected, ...vals])));
  }
  function clearAll() { onChange([]); setSearch(""); }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs transition-colors",
          active ? "bg-cream-700 text-white" : "text-cream-400 hover:bg-cream-100 hover:text-cream-700"
        )}
        title={`${title} 필터${active ? ` (${selected.length}개 선택)` : ""}`}
      >
        ▼
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-60 bg-white border border-cream-200 rounded-lg shadow-lg text-left font-normal">
          <div className="p-2 border-b border-cream-100 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-cream-600">{title} 필터</span>
              {active && (
                <button onClick={clearAll} className="text-[11px] text-red-400 hover:text-red-600">필터 해제</button>
              )}
            </div>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..." autoFocus
              className="w-full border border-cream-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-cream-400"
            />
            <div className="flex gap-2 text-[11px]">
              <button onClick={selectAllVisible} className="text-cream-600 hover:text-cream-800 underline">
                {search ? "검색결과 모두 선택" : "전체 선택"}
              </button>
              <button onClick={() => onChange([])} className="text-cream-400 hover:text-cream-600 underline">모두 해제</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {groupedList.length === 0 && (
              <div className="px-2 py-3 text-xs text-cream-400 text-center">일치하는 항목 없음</div>
            )}
            {groupedList.map((g, gi) => (
              <div key={gi}>
                {g.group && (
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium text-cream-400">{g.group}</div>
                )}
                {g.items.map((o) => (
                  <label key={o.value}
                    className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-cream-50 cursor-pointer text-xs text-cream-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(o.value)}
                      onChange={() => toggle(o.value)}
                      className="accent-cream-700"
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
