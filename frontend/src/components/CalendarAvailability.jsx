import { useState, useMemo, useEffect, useRef } from 'react';
import './CalendarAvailability.css';

const HOURS_START = 0;
const HOURS_END = 24;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COMMON_TIMEZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Halifax', 'America/Sao_Paulo',
  'Atlantic/Reykjavik', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

function formatTzLabel(tz) {
  try {
    const now = new Date();
    const short = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop();
    const offset = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).split('GMT').pop() || '+0';
    const city = tz.split('/').pop().replace(/_/g, ' ');
    return `(GMT${offset}) ${city} (${short})`;
  } catch { return tz; }
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function formatWeekRange(dates) {
  const first = dates[0];
  const last = dates[6];
  if (first.getFullYear() !== last.getFullYear()) {
    return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()}, ${first.getFullYear()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${first.getFullYear()}`;
}

function formatDayTitle(date) {
  return `${DAY_LABELS[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatMonthTitle(date) {
  return `${FULL_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function getMonthCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

function timeToRow(time) {
  const [h, m] = time.split(':').map(Number);
  return (h - HOURS_START) * 2 + (m >= 30 ? 1 : 0);
}

function rowToTime(row) {
  const h = HOURS_START + Math.floor(row / 2);
  const m = row % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
}

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function CalendarAvailability({ availability, onChange }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('week');
  const [dragging, setDragging] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());
  const pickerYear = pickerMonth.getFullYear();
  const [pickerHoverWeek, setPickerHoverWeek] = useState(-1);
  const pickerRef = useRef(null);
  const gridWrapperRef = useRef(null);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Auto-scroll to 8 AM on mount (offset by header height so 8 AM is visible)
  useEffect(() => {
    if (gridWrapperRef.current) {
      const rowHeight = 24;
      gridWrapperRef.current.scrollTop = (8 * 2) * rowHeight;
    }
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  // Update current time every minute for the time indicator
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const totalRows = (HOURS_END - HOURS_START) * 2;

  const slotsByDate = useMemo(() => {
    const map = {};
    (availability || []).forEach((slot, idx) => {
      if (!map[slot.date]) map[slot.date] = [];
      map[slot.date].push({ ...slot, _idx: idx });
    });
    return map;
  }, [availability]);

  const monthDays = useMemo(() => getMonthCalendarDays(monthDate.getFullYear(), monthDate.getMonth()), [monthDate]);

  // Navigation
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };
  const prevMonth = () => { const d = new Date(monthDate); d.setMonth(d.getMonth() - 1); setMonthDate(d); };
  const nextMonth = () => { const d = new Date(monthDate); d.setMonth(d.getMonth() + 1); setMonthDate(d); };

  const goToday = () => {
    const now = new Date();
    setWeekStart(getWeekStart(now));
    setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    setMonthDate(new Date(now));
  };

  // Mini calendar: rows of 7 days covering full weeks for a month
  const pickerWeeks = useMemo(() => {
    const y = pickerMonth.getFullYear(), m = pickerMonth.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = first.getDay();
    const start = new Date(y, m, 1 - startOffset);
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        week.push(day);
      }
      // skip row if entire week is in next month (beyond the displayed month)
      if (w >= 4 && week[0].getMonth() !== m && week[6].getMonth() !== m) break;
      weeks.push(week);
    }
    return weeks;
  }, [pickerMonth]);

  const handlePickerWeekClick = (weekRow) => {
    const ws = getWeekStart(weekRow[0]);
    setWeekStart(ws);
    setSelectedDate(weekRow[0]);
    setMonthDate(new Date(weekRow[0]));
    setPickerOpen(false);
  };

  const handlePickerMonthSelect = (monthIdx) => {
    setPickerMonth(new Date(pickerYear, monthIdx, 1));
  };

  const handlePickerToday = () => {
    const t = new Date();
    setPickerMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    goToday();
    setPickerOpen(false);
  };

  const togglePicker = () => {
    if (!pickerOpen) {
      if (viewMode === 'week') {
        setPickerMonth(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1));
      } else if (viewMode === 'day') {
        setPickerMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
      } else {
        setPickerMonth(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
      }
    }
    setPickerOpen(!pickerOpen);
  };

  const handleMouseDown = (dayIdx, row) => {
    setDragging({ dayIdx, startRow: row, currentRow: row });
  };

  const handleMouseEnter = (dayIdx, row) => {
    if (dragging && dragging.dayIdx === dayIdx) {
      setDragging({ ...dragging, currentRow: row });
    }
  };

  const handleMouseUp = () => {
    if (!dragging) return;
    const { dayIdx, startRow, currentRow } = dragging;
    const fromRow = Math.min(startRow, currentRow);
    const toRow = Math.max(startRow, currentRow);
    let date;
    if (viewMode === 'day') {
      date = toDateStr(selectedDate);
    } else {
      date = toDateStr(weekDates[dayIdx]);
    }
    const start_time = rowToTime(fromRow);
    const end_time = rowToTime(toRow + 1);

    const newSlot = { date, start_time, end_time };
    onChange([...availability, newSlot]);
    setDragging(null);
  };

  const removeSlot = (idx) => {
    onChange(availability.filter((_, i) => i !== idx));
  };

  const todayStr = toDateStr(new Date());

  const handleMonthDayClick = (day) => {
    if (!day) return;
    setSelectedDate(day);
    setViewMode('day');
  };

  // Prev/next based on view mode
  const handlePrev = () => { if (viewMode === 'week') prevWeek(); else if (viewMode === 'day') prevDay(); else prevMonth(); };
  const handleNext = () => { if (viewMode === 'week') nextWeek(); else if (viewMode === 'day') nextDay(); else nextMonth(); };

  const titleText = viewMode === 'week'
    ? formatWeekRange(weekDates)
    : viewMode === 'day'
      ? formatDayTitle(selectedDate)
      : formatMonthTitle(monthDate);

  // Columns for the time grid
  const gridDates = viewMode === 'day' ? [selectedDate] : weekDates;
  const colCount = gridDates.length;

  // Check if current view contains today
  const viewContainsToday = useMemo(() => {
    if (viewMode === 'day') return toDateStr(selectedDate) === todayStr;
    if (viewMode === 'week') return weekDates.some(d => toDateStr(d) === todayStr);
    if (viewMode === 'month') return monthDate.getMonth() === now.getMonth() && monthDate.getFullYear() === now.getFullYear();
    return false;
  }, [viewMode, selectedDate, weekDates, monthDate, todayStr, now]);

  // Current time position for the red indicator line
  const nowTimePosition = useMemo(() => {
    if (viewMode === 'month') return null;
    const todayDayIdx = gridDates.findIndex(d => toDateStr(d) === todayStr);
    if (todayDayIdx === -1) return null;
    const h = now.getHours();
    const m = now.getMinutes();
    const row = (h - HOURS_START) * 2 + (m / 30);
    return { dayIdx: todayDayIdx, row };
  }, [gridDates, todayStr, now, viewMode]);

  return (
    <div className="cal-container" onMouseUp={handleMouseUp} onMouseLeave={() => setDragging(null)}>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={handlePrev}>‹</button>
          <button type="button" className={`cal-today-btn ${viewContainsToday ? 'cal-today-btn-active' : 'cal-today-btn-away'}`} onClick={goToday}>
            {viewContainsToday ? '● Today' : '↩ Today'}
          </button>
          <button type="button" className="cal-nav-btn" onClick={handleNext}>›</button>
          <div className="cal-view-toggle">
            {['day', 'week', 'month'].map(v => (
              <button
                key={v}
                type="button"
                className={`cal-view-btn ${viewMode === v ? 'cal-view-btn-active' : ''}`}
                onClick={() => setViewMode(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-title-wrapper" ref={pickerRef}>
          <button type="button" className="cal-title-btn" onClick={togglePicker}>
            {titleText} <span className="cal-title-chevron">{pickerOpen ? '▲' : '▼'}</span>
          </button>
          {pickerOpen && (
            <div className="cal-picker-dropdown">
              <div className="cal-picker-left">
                <div className="cal-picker-month-header">
                  <span className="cal-picker-month-title">
                    {FULL_MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                  </span>
                  <div className="cal-picker-month-nav">
                    <button type="button" onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}>↑</button>
                    <button type="button" onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}>↓</button>
                  </div>
                </div>
                <div className="cal-picker-mini-grid">
                  {['S','M','T','W','T','F','S'].map((l, i) => (
                    <div key={i} className="cal-picker-mini-hdr">{l}</div>
                  ))}
                  {pickerWeeks.map((week, wi) => {
                    const weekStartStr = toDateStr(getWeekStart(week[0]));
                    const currentWeekStr = toDateStr(weekStart);
                    const isSelectedWeek = weekStartStr === currentWeekStr;
                    const isHoverWeek = wi === pickerHoverWeek;
                    return week.map((day, di) => {
                      const isCurrentMonth = day.getMonth() === pickerMonth.getMonth();
                      const dayStr = toDateStr(day);
                      const isToday = dayStr === todayStr;
                      const isFirst = di === 0;
                      const isLast = di === 6;
                      return (
                        <div
                          key={`${wi}-${di}`}
                          className={`cal-picker-mini-day${!isCurrentMonth ? ' cal-picker-dim' : ''}${isToday ? ' cal-picker-today' : ''}${isSelectedWeek ? ' cal-picker-sel-week' : ''}${isHoverWeek && !isSelectedWeek ? ' cal-picker-hover-week' : ''}${isFirst ? ' cal-picker-week-first' : ''}${isLast ? ' cal-picker-week-last' : ''}`}
                          onClick={() => handlePickerWeekClick(week)}
                          onMouseEnter={() => setPickerHoverWeek(wi)}
                          onMouseLeave={() => setPickerHoverWeek(-1)}
                        >
                          {day.getDate()}
                        </div>
                      );
                    });
                  })}
                </div>
              </div>
              <div className="cal-picker-right">
                <div className="cal-picker-year-header">
                  <span className="cal-picker-year-title">{pickerYear}</span>
                  <div className="cal-picker-year-nav">
                    <button type="button" onClick={() => setPickerMonth(new Date(pickerYear - 1, pickerMonth.getMonth(), 1))}>↑</button>
                    <button type="button" onClick={() => setPickerMonth(new Date(pickerYear + 1, pickerMonth.getMonth(), 1))}>↓</button>
                  </div>
                </div>
                <div className="cal-picker-year-grid">
                  {MONTH_NAMES.map((mn, mi) => {
                    const isCurrent = mi === pickerMonth.getMonth() && pickerYear === pickerMonth.getFullYear();
                    return (
                      <div
                        key={mi}
                        className={`cal-picker-year-month${isCurrent ? ' cal-picker-year-month-active' : ''}`}
                        onClick={() => handlePickerMonthSelect(mi)}
                      >
                        {mn}
                      </div>
                    );
                  })}
                </div>
                <div className="cal-picker-today-link">
                  <button type="button" onClick={handlePickerToday}>Today</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="cal-hint">Click &amp; drag to add • Click slot to remove</div>
        <div className="cal-tz-wrapper">
          <span className="cal-tz-icon">🌐</span>
          <select className="cal-tz-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {(() => {
              const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const allTzs = COMMON_TIMEZONES.includes(browserTz) ? COMMON_TIMEZONES : [browserTz, ...COMMON_TIMEZONES];
              return allTzs.map(tz => (
                <option key={tz} value={tz}>{formatTzLabel(tz)}</option>
              ));
            })()}
          </select>
        </div>
      </div>

      {viewMode === 'month' ? (
        <div className="cal-month-grid-wrapper">
          <div className="cal-month-grid">
            {DAY_LABELS.map(label => (
              <div key={label} className="cal-month-header">{label}</div>
            ))}
            {monthDays.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} className="cal-month-cell cal-month-cell-blank" />;
              const ds = toDateStr(day);
              const isToday = ds === todayStr;
              const hasSlots = !!(slotsByDate[ds] && slotsByDate[ds].length > 0);
              const slotCount = hasSlots ? slotsByDate[ds].length : 0;
              return (
                <div
                  key={ds}
                  className={`cal-month-cell ${isToday ? 'cal-month-cell-today' : ''} ${hasSlots ? 'cal-month-cell-has-slots' : ''}`}
                  onClick={() => handleMonthDayClick(day)}
                  title={hasSlots ? `${slotCount} slot(s) – click to view day` : 'Click to view day'}
                >
                  <span className={`cal-month-day-num ${isToday ? 'cal-today-num' : ''}`}>{day.getDate()}</span>
                  {hasSlots && (
                    <div className="cal-month-dots">
                      {slotsByDate[ds].slice(0, 3).map((_, j) => (
                        <span key={j} className="cal-month-dot" />
                      ))}
                      {slotCount > 3 && <span className="cal-month-dot-more">+{slotCount - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="cal-grid-wrapper" ref={gridWrapperRef}>
          <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${colCount}, 1fr)`, gridTemplateRows: `40px repeat(${totalRows}, 24px)` }}>
            {/* Header row */}
            <div className="cal-corner" style={{ gridColumn: 1, gridRow: 1 }} />
            {gridDates.map((d, i) => {
              const ds = toDateStr(d);
              const isToday = ds === todayStr;
              return (
                <div key={i} className={`cal-day-header ${isToday ? 'cal-today' : ''}`}
                  style={{ gridColumn: i + 2, gridRow: 1 }}>
                  <span className="cal-day-label">{DAY_LABELS[d.getDay()]}</span>
                  <span className={`cal-day-num ${isToday ? 'cal-today-num' : ''}`}>{d.getDate()}</span>
                </div>
              );
            })}

            {/* Time labels + grid cells */}
            {Array.from({ length: totalRows }, (_, row) => {
              const hour = HOURS_START + Math.floor(row / 2);
              const isHourStart = row % 2 === 0;
              return [
                <div key={`t-${row}`} className={`cal-time-label ${isHourStart ? 'cal-time-label-hour' : 'cal-time-label-half'}`}
                  style={{ gridColumn: 1, gridRow: row + 2 }}>
                  {isHourStart ? formatTime12(`${String(hour).padStart(2, '0')}:00`) : ''}
                </div>,
                ...gridDates.map((d, dayIdx) => {
                  const isHighlight = dragging && dragging.dayIdx === dayIdx &&
                    row >= Math.min(dragging.startRow, dragging.currentRow) &&
                    row <= Math.max(dragging.startRow, dragging.currentRow);

                  return (
                    <div
                      key={`c-${row}-${dayIdx}`}
                      className={`cal-cell ${isHourStart ? 'cal-cell-hour' : ''} ${isHighlight ? 'cal-cell-drag' : ''}`}
                      style={{ gridColumn: dayIdx + 2, gridRow: row + 2 }}
                      onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dayIdx, row); }}
                      onMouseEnter={() => handleMouseEnter(dayIdx, row)}
                    />
                  );
                })
              ];
            }).flat()}

            {/* Overlay: availability blocks */}
            {gridDates.map((d, dayIdx) => {
              const ds = toDateStr(d);
              const slots = slotsByDate[ds] || [];
              return slots.map((slot) => {
                const startRow = timeToRow(slot.start_time);
                const endRow = timeToRow(slot.end_time);
                const span = endRow - startRow;
                if (span <= 0) return null;

                return (
                  <div
                    key={`s-${slot._idx}`}
                    className="cal-slot"
                    style={{
                      gridColumn: dayIdx + 2,
                      gridRow: `${startRow + 2} / span ${span}`,
                    }}
                    onClick={(e) => { e.stopPropagation(); removeSlot(slot._idx); }}
                    title={`${formatTime12(slot.start_time)} – ${formatTime12(slot.end_time)}\nClick to remove`}
                  >
                    <span className="cal-slot-time">{formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}</span>
                  </div>
                );
              });
            })}

            {/* Current time indicator line */}
            {nowTimePosition && (
              <div
                className="cal-now-line"
                style={{
                  gridColumn: `${nowTimePosition.dayIdx + 2} / span 1`,
                  gridRow: `${Math.floor(nowTimePosition.row) + 2} / span 1`,
                  top: `${(nowTimePosition.row % 1) * 100}%`,
                }}
              >
                <div className="cal-now-dot" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
