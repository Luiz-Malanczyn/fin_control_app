import { useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { dashboardApi } from '../lib/resources'
import { formatCurrency, type CalendarItem } from '../lib/types'

export default function CalendarPage() {
  const [monthAnchor, setMonthAnchor] = useState(new Date())
  const [items, setItems] = useState<CalendarItem[]>([])

  const monthStart = startOfMonth(monthAnchor)
  const monthEnd = endOfMonth(monthAnchor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  function reload() {
    dashboardApi
      .calendar(format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd'))
      .then(setItems)
  }

  useEffect(reload, [gridStart.getTime(), gridEnd.getTime()])

  async function togglePaid(item: CalendarItem) {
    await dashboardApi.markPaid({
      paid: !item.paid,
      transaction_id: item.transaction_id,
      recurring_rule_id: item.recurring_rule_id,
      installment_id: item.installment_id,
      installment_number: item.installment_number,
      occurrence_date: item.date,
    })
    reload()
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of items) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [items])

  return (
    <div>
      <div className="page-header">
        <h1>Calendário</h1>
        <div className="form-row" style={{ gap: 6 }}>
          <button className="btn-ghost" onClick={() => setMonthAnchor((d) => addMonths(d, -1))}>
            ← anterior
          </button>
          <span style={{ minWidth: 140, textAlign: 'center', textTransform: 'capitalize', alignSelf: 'center' }}>
            {format(monthAnchor, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button className="btn-ghost" onClick={() => setMonthAnchor((d) => addMonths(d, 1))}>
            próximo →
          </button>
        </div>
      </div>
      <p className="empty-hint" style={{ marginTop: -10, marginBottom: 16 }}>
        Marque a caixinha quando pagar uma conta — não precisa esperar a data chegar.
      </p>

      <div className="calendar-grid">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
          <div key={label} className="calendar-weekday">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayItems = itemsByDay.get(key) ?? []
          return (
            <div
              key={key}
              className={
                'calendar-cell' +
                (isSameMonth(day, monthAnchor) ? '' : ' outside') +
                (isToday(day) ? ' today' : '')
              }
            >
              <span className="calendar-daynum">{format(day, 'd')}</span>
              <div className="calendar-items">
                {dayItems.map((item, index) => (
                  <label
                    key={index}
                    className={'calendar-item ' + item.kind + (item.paid ? ' paid' : '')}
                  >
                    <input
                      type="checkbox"
                      checked={item.paid}
                      onChange={() => togglePaid(item)}
                      className="calendar-item-check"
                    />
                    <span className="calendar-item-desc">{item.description}</span>
                    <span>{formatCurrency(item.amount)}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
