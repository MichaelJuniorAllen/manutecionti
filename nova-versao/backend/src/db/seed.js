import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import db from './database.js'

function seed() {
  const now = new Date().toISOString()
  const yesterday = new Date(Date.now() - 86400000).toISOString()

  // Users
  const users = [
    { id: randomUUID(), name: 'Administrador', email: 'admin@example.com', password: 'admin123', role: 'admin' },
    { id: randomUUID(), name: 'Usuário Teste', email: 'user@example.com', password: 'user123', role: 'user' },
    { id: randomUUID(), name: 'Maria Silva', email: 'maria@example.com', password: 'maria123', role: 'user' },
  ]

  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const resolvedUsers = []
  for (const u of users) {
    const existing = db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').get(u.email)
    if (existing) {
      resolvedUsers.push(existing)
      console.log(`[seed] Usuário já existe: ${u.email}`)
    } else {
      const hash = bcrypt.hashSync(u.password, 10)
      insertUser.run(u.id, u.name, u.email, hash, u.role, now)
      resolvedUsers.push({ id: u.id, name: u.name, email: u.email, role: u.role })
      console.log(`[seed] Usuário criado: ${u.email}`)
    }
  }

  const admin = resolvedUsers[0]
  const user1 = resolvedUsers[1]
  const user2 = resolvedUsers[2]

  const tickets = [
    {
      id: randomUUID(),
      title: 'Erro ao acessar o painel financeiro',
      description: 'O sistema retorna tela em branco ao abrir o módulo financeiro após o login.',
      priority: 'critica',
      status: 'Em andamento',
      category: 'Software',
      created_by: admin.id,
      created_by_name: admin.name,
      created_at: now,
      updated_at: now,
      closed_at: null,
    },
    {
      id: randomUUID(),
      title: 'Computador não liga na recepção',
      description: 'O computador da recepção parou de ligar após queda de energia.',
      priority: 'alta',
      status: 'Aberto',
      category: 'Hardware',
      created_by: user1.id,
      created_by_name: user1.name,
      created_at: now,
      updated_at: now,
      closed_at: null,
    },
    {
      id: randomUUID(),
      title: 'Internet intermitente no setor comercial',
      description: 'A rede cai de forma recorrente nas estações próximas à sala de reunião.',
      priority: 'alta',
      status: 'Aguardando',
      category: 'Rede',
      created_by: user2.id,
      created_by_name: user2.name,
      created_at: now,
      updated_at: now,
      closed_at: null,
    },
    {
      id: randomUUID(),
      title: 'Atualização do antivírus corporativo',
      description: 'As máquinas do time de operações precisam receber a nova política de segurança.',
      priority: 'baixa',
      status: 'Concluído',
      category: 'Segurança',
      created_by: admin.id,
      created_by_name: admin.name,
      created_at: yesterday,
      updated_at: yesterday,
      closed_at: yesterday,
    },
    {
      id: randomUUID(),
      title: 'Impressora do RH sem conexão',
      description: 'A impressora principal do RH não é detectada na rede desde o início do expediente.',
      priority: 'alta',
      status: 'Concluído',
      category: 'Hardware',
      created_by: user1.id,
      created_by_name: user1.name,
      created_at: yesterday,
      updated_at: yesterday,
      closed_at: yesterday,
    },
    {
      id: randomUUID(),
      title: 'Instalação de software de gestão',
      description: 'Instalar e configurar o novo software de gestão de estoque no almoxarifado.',
      priority: 'media',
      status: 'Aberto',
      category: 'Software',
      created_by: user2.id,
      created_by_name: user2.name,
      created_at: yesterday,
      updated_at: yesterday,
      closed_at: null,
    },
  ]

  const insertTicket = db.prepare(
    `INSERT OR IGNORE INTO tickets
      (id, title, description, priority, status, category, created_by, created_by_name, created_at, updated_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  for (const t of tickets) {
    insertTicket.run(
      t.id, t.title, t.description, t.priority, t.status, t.category || null,
      t.created_by, t.created_by_name, t.created_at, t.updated_at, t.closed_at || null
    )
    console.log(`[seed] Ticket criado: ${t.title}`)
  }

  console.log('\n[seed] ✅ Seed concluído com sucesso!')
  console.log('Credenciais de acesso:')
  console.log('  Admin:   admin@example.com  / admin123')
  console.log('  Usuário: user@example.com   / user123')
  console.log('  Maria:   maria@example.com  / maria123')
}

seed()
