import { useState, useMemo, useEffect } from 'react';
import './CalendarAvailability.css';

const HOURS_START = 0;
const HOURS_END = 24;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
        </div>
        <div className="cal-title">{titleText}</div>
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
        <div className="cal-hint">Click &amp; drag to add • Click slot to remove</div>
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
        <div className="cal-grid-wrapper">
          <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${colCount}, 1fr)`, gridTemplateRows: `40px repeat(${totalRows}, 24px)` }}>
            {/* Header row */}
            <div className="cal-corner" />
            {gridDates.map((d, i) => {
              const ds = toDateStr(d);
              const isToday = ds === todayStr;
              return (
                <div key={i} className={`cal-day-header ${isToday ? 'cal-today' : ''}`}>
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
                <div key={`t-${row}`} className={`cal-time-label ${isHourStart ? 'cal-time-label-hour' : 'cal-time-label-half'}`}>
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
