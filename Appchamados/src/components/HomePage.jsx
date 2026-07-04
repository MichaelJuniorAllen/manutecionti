function HomePage({ onNavigate }) {
  return (
    <section className="home-container">
      <div className="home-intro">
        <h2>Bem-vindo!</h2>
        <p>Sistema inteligente para gerenciar chamados de manutenção</p>
      </div>

      <div className="home-cards">
        <article className="home-card card-new" onClick={() => onNavigate('cadastro')}>
          <div className="card-icon">📝</div>
          <h3>Novo Chamado</h3>
          <p>Registre uma nova solicitação de manutenção</p>
          <button type="button" className="card-button">Cadastrar</button>
        </article>

        <article className="home-card card-history" onClick={() => onNavigate('registro')}>
          <div className="card-icon">📋</div>
          <h3>Ver Histórico</h3>
          <p>Acompanhe todas as solicitações registradas</p>
          <button type="button" className="card-button">Consultar</button>
        </article>
      </div>

      <div className="home-info">
        <p>✓ Dados salvos automaticamente no navegador</p>
        <p>✓ Acesso rápido ao histórico de chamados</p>
        <p>✓ Sistema de prioridades inteligente</p>
      </div>
    </section>
  )
}

export default HomePage
