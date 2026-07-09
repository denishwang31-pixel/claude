import React from "react";
import { DateParts, buildDateRange } from "../lib/dateRange";

interface Props {
  start: DateParts;
  end: DateParts;
  onChange: (start: DateParts, end: DateParts) => void;
  onClear?: () => void;
}

const EMPTY: DateParts = { y: "", m: "", d: "" };

/** 년(필수)/월(선택)/일(선택) ~ 년/월/일 기간 입력.
 *  월·일을 비우면 상위 단위 전체로 검색된다. */
export function DateRangeFilter({ start, end, onChange, onClear }: Props) {
  const range = buildDateRange(start, end);
  const has = !!(start.y || start.m || start.d || end.y || end.m || end.d);

  function setStart(patch: Partial<DateParts>) { onChange({ ...start, ...patch }, end); }
  function setEnd(patch: Partial<DateParts>) { onChange(start, { ...end, ...patch }); }

  const inputCls = "border border-cream-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cream-500 text-center";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* 시작 */}
      <div className="flex items-center gap-1">
        <input type="number" placeholder="년" value={start.y} onChange={(e) => setStart({ y: e.target.value })}
          className={inputCls + " w-16"} />
        <span className="text-cream-400 text-xs">년</span>
        <input type="number" placeholder="월" min={1} max={12} value={start.m} onChange={(e) => setStart({ m: e.target.value })}
          className={inputCls + " w-12"} />
        <span className="text-cream-400 text-xs">월</span>
        <input type="number" placeholder="일" min={1} max={31} value={start.d} onChange={(e) => setStart({ d: e.target.value })}
          className={inputCls + " w-12"} />
        <span className="text-cream-400 text-xs">일</span>
      </div>
      <span className="text-cream-500 px-0.5">~</span>
      {/* 종료 */}
      <div className="flex items-center gap-1">
        <input type="number" placeholder="년" value={end.y} onChange={(e) => setEnd({ y: e.target.value })}
          className={inputCls + " w-16"} />
        <span className="text-cream-400 text-xs">년</span>
        <input type="number" placeholder="월" min={1} max={12} value={end.m} onChange={(e) => setEnd({ m: e.target.value })}
          className={inputCls + " w-12"} />
        <span className="text-cream-400 text-xs">월</span>
        <input type="number" placeholder="일" min={1} max={31} value={end.d} onChange={(e) => setEnd({ d: e.target.value })}
          className={inputCls + " w-12"} />
        <span className="text-cream-400 text-xs">일</span>
      </div>

      {has && (
        <button onClick={() => { onChange(EMPTY, EMPTY); onClear?.(); }}
          className="text-cream-400 hover:text-cream-600 text-base leading-none px-0.5" title="기간 초기화">✕</button>
      )}
      {range && (
        <span className="text-[11px] text-cream-400 whitespace-nowrap">({range.start} ~ {range.end})</span>
      )}
    </div>
  );
}
