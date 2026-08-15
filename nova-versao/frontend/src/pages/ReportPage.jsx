import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

export default function ReportPage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadReport() {
      setLoading(true)
      try {
        const response = await api.reports.yesterday()
        setReport(response)
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [])

  if (loading) {
    return <div className="panel loading-panel">Carregando relatório...</div>
  }

  if (!report) {
    return <div className="panel empty-state">Relatório indisponível.</div>
  }

  return (
    <div className="page-stack">
      <section className="stats-grid two-columns">
        <article className="stat-card">
          <span>Data do relatório</span>
          <strong>{report.date}</strong>
          <p>Consolidação referente ao dia anterior.</p>
        </article>
        <article className="stat-card accent-green">
          <span>Total resolvido</span>
          <strong>{report.total_resolved}</strong>
          <p>Chamados concluídos no período analisado.</p>
        </article>
        <article className="stat-card accent-blue">
          <span>Total criado</span>
          <strong>{report.total_created}</strong>
          <p>Demandas registradas no dia anterior.</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Distribuição por status</h2>
              <p>Como os chamados criados ontem estão classificados.</p>
            </div>
          </div>
          <div className="breakdown-grid">
            {Object.entries(report.by_status).map(([status, total]) => (
              <div key={status} className="breakdown-card">
                <span>{status}</span>
                <strong>{total}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Distribuição por prioridade</h2>
              <p>Visão de criticidade das aberturas do dia anterior.</p>
            </div>
          </div>
          <div className="breakdown-grid">
            {Object.entries(report.by_priority).map(([priority, total]) => (
              <div key={priority} className="breakdown-card">
                <span>{priority}</span>
                <strong>{total}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
