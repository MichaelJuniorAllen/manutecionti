import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const colors = ['#2368a2', '#26734d', '#a96500', '#b3261e', '#63705f']

function DashboardChart({ title, children }) {
  return (
    <article className="dashboard-chart panel">
      <h3>{title}</h3>
      <div className="chart-wrap">{children}</div>
    </article>
  )
}

function UserDashboard({ dashboard }) {
  const indicators = dashboard?.indicators || {}
  const charts = dashboard?.charts || {}

  return (
    <section className="dashboard-section">
      <div className="stats profile-stats">
        <div className="stat"><small>Atendidos no mês</small><strong>{indicators.attendedThisMonth || 0}</strong></div>
        <div className="stat"><small>Abertos</small><strong>{indicators.opened || 0}</strong></div>
        <div className="stat"><small>Concluídos</small><strong>{indicators.completed || 0}</strong></div>
        <div className="stat"><small>Pendentes</small><strong>{indicators.pending || 0}</strong></div>
        <div className="stat"><small>Tempo médio (min)</small><strong>{indicators.avgResolution || 0}</strong></div>
        <div className="stat"><small>Prioridade Alta</small><strong>{indicators.highPriority || 0}</strong></div>
        <div className="stat"><small>Prioridade Média</small><strong>{indicators.mediumPriority || 0}</strong></div>
        <div className="stat"><small>Prioridade Baixa</small><strong>{indicators.lowPriority || 0}</strong></div>
      </div>

      <div className="dashboard-grid">
        <DashboardChart title="Chamados por mês">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.byMonth || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#2368a2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChart>

        <DashboardChart title="Chamados por prioridade">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={charts.byPriority || []} dataKey="total" nameKey="name" outerRadius={90} label>
                {(charts.byPriority || []).map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChart>

        <DashboardChart title="Chamados por status">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.byStatus || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#26734d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChart>

        <DashboardChart title="Chamados por área">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.byArea || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#a96500" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChart>
      </div>
    </section>
  )
}

export default UserDashboard
