// ============================================================
// SEED DATA — Hilo Andino CRM
// ============================================================

const BRANDS = [
  { id: "element",   name: "Element Premium", color: "#B5462A", types: ["Jeans", "Polos", "Cargos", "Casacas"] },
  { id: "qepo",      name: "QEPO",            color: "#3F5566", types: ["Jeans", "Drill", "Cargos", "Shorts"] },
  { id: "boosh",     name: "Boosh",           color: "#5C7A5A", types: ["Polos", "Casacas", "Shorts"] },
  { id: "kuntur",    name: "Kuntur",          color: "#C98A3B", types: ["Polos", "Casacas", "Drill"] },
  { id: "killari",   name: "Killari",         color: "#7A4E7E", types: ["Casacas", "Cargos", "Drill"] },
];

// Provincias / regiones del Perú con coordenadas aproximadas en un canvas 600×800
// (no es un mapa geográfico exacto — es una proyección estilizada)
const REGIONS = [
  { id: "lima",      name: "Lima",          x: 215, y: 470 },
  { id: "callao",    name: "Callao",        x: 200, y: 465 },
  { id: "arequipa",  name: "Arequipa",      x: 360, y: 660 },
  { id: "cusco",     name: "Cusco",         x: 395, y: 555 },
  { id: "puno",      name: "Puno",          x: 445, y: 615 },
  { id: "trujillo",  name: "La Libertad",   x: 200, y: 320 },
  { id: "piura",     name: "Piura",         x: 130, y: 200 },
  { id: "chiclayo",  name: "Lambayeque",    x: 155, y: 260 },
  { id: "huancayo",  name: "Junín",         x: 280, y: 470 },
  { id: "iquitos",   name: "Loreto",        x: 410, y: 200 },
  { id: "tacna",     name: "Tacna",         x: 410, y: 740 },
  { id: "ayacucho",  name: "Ayacucho",      x: 305, y: 555 },
  { id: "huaraz",    name: "Áncash",        x: 220, y: 360 },
  { id: "cajamarca", name: "Cajamarca",     x: 195, y: 250 },
  { id: "ica",       name: "Ica",           x: 245, y: 555 },
  { id: "tumbes",    name: "Tumbes",        x: 105, y: 145 },
  { id: "ucayali",   name: "Ucayali",       x: 380, y: 380 },
  { id: "loreto",    name: "Madre de Dios", x: 470, y: 470 },
];

// Países disponibles (Perú por defecto)
const COUNTRIES = [
  { id: "PE", name: "Perú",    flag: "🇵🇪" },
  { id: "BO", name: "Bolivia", flag: "🇧🇴" },
  { id: "EC", name: "Ecuador", flag: "🇪🇨" },
];

// Departamentos por país (los 24 + Callao para Perú; oficiales BO/EC)
const DEPARTMENTS = {
  PE: [
    "Amazonas","Áncash","Apurímac","Arequipa","Ayacucho","Cajamarca","Callao","Cusco",
    "Huancavelica","Huánuco","Ica","Junín","La Libertad","Lambayeque","Lima","Loreto",
    "Madre de Dios","Moquegua","Pasco","Piura","Puno","San Martín","Tacna","Tumbes","Ucayali",
  ],
  BO: [
    "La Paz","Cochabamba","Santa Cruz","Oruro","Potosí","Chuquisaca","Tarija","Beni","Pando",
  ],
  EC: [
    "Azuay","Bolívar","Cañar","Carchi","Chimborazo","Cotopaxi","El Oro","Esmeraldas","Galápagos",
    "Guayas","Imbabura","Loja","Los Ríos","Manabí","Morona Santiago","Napo","Orellana","Pastaza",
    "Pichincha","Santa Elena","Santo Domingo de los Tsáchilas","Sucumbíos","Tungurahua","Zamora Chinchipe",
  ],
};

// Familias / grupos vinculados
const FAMILIES = [
  { id: "fam-quispe",   surname: "Quispe Mamani",  note: "Hermanos · 3 tiendas en Cusco" },
  { id: "fam-rojas",    surname: "Rojas Huamán",   note: "Madre e hijas · Gamarra" },
  { id: "fam-flores",   surname: "Flores Condori", note: "Esposos + cuñado · Juliaca" },
  { id: "fam-vilca",    surname: "Vilca",          note: "Tres sucursales · Arequipa" },
];

// Clientes
const CLIENTS = [
  {
    id: "c-001", code: "CL-1042",
    name: "Boutique Boosh Wasi", contact: "Rosa Quispe Mamani", role: "Dueña",
    ruc: "20486512034", phone: "984 221 305", whatsapp: true, email: "rosa@sumaqwasi.pe",
    region: "cusco", district: "Wanchaq", address: "Av. La Cultura 1245",
    tier: "Oro", channel: "Boutique", since: "2021-03-14",
    creditLine: 12000, creditUsed: 4800, paymentTerms: "30 días",
    familyId: "fam-quispe", lastPurchase: "2026-04-12", lastPurchaseAmount: 3850,
    avgMonthly: 4200, ytd: 38400,
    nextFollowup: "2026-05-05", followupReason: "Cierre de pedido temporada otoño",
    priority: "alta", status: "activo",
    brands: ["kuntur", "killari", "element"], topType: "Casacas",
    tags: ["VIP", "Pago puntual", "Recompra alta"],
    salesperson: "Diego R.",
  },
  {
    id: "c-002", code: "CL-1043", linkedTo: "c-001",
    name: "Tienda Inti Market", contact: "Luis Quispe Mamani", role: "Dueño",
    ruc: "10456789012", phone: "984 221 412",
    region: "cusco", district: "San Sebastián", address: "Av. Cusco 880",
    tier: "Plata", channel: "Tienda de barrio", since: "2022-08-02",
    creditLine: 6000, creditUsed: 5200, paymentTerms: "15 días",
    familyId: "fam-quispe", lastPurchase: "2026-03-18", lastPurchaseAmount: 1980,
    avgMonthly: 2100, ytd: 14200,
    nextFollowup: "2026-05-05", followupReason: "Línea de crédito al 87%",
    priority: "alta", status: "activo",
    brands: ["boosh", "qepo"], topType: "Polos",
    tags: ["Crédito ajustado"],
    salesperson: "Diego R.",
  },
  {
    id: "c-003", code: "CL-1077", linkedTo: "c-001",
    name: "Comercial Killari", contact: "Mariela Quispe Mamani", role: "Administradora",
    ruc: "20567812345", phone: "984 339 110",
    region: "cusco", district: "Cusco", address: "Calle Saphi 412",
    tier: "Oro", channel: "Mayorista", since: "2020-11-09",
    creditLine: 18000, creditUsed: 7400, paymentTerms: "45 días",
    familyId: "fam-quispe", lastPurchase: "2026-04-22", lastPurchaseAmount: 6420,
    avgMonthly: 7100, ytd: 64200,
    nextFollowup: "2026-05-12", followupReason: "Reposición programada",
    priority: "media", status: "activo",
    brands: ["killari", "kuntur"], topType: "Drill",
    tags: ["VIP"],
    salesperson: "Diego R.",
  },
  {
    id: "c-004", code: "CL-2018",
    name: "Galería Rojas — Stand 214", contact: "Carmen Rojas Huamán", role: "Dueña",
    ruc: "10412784390", phone: "999 102 884",
    region: "lima", district: "La Victoria", address: "Jr. Gamarra 642 · Stand 214",
    tier: "Oro", channel: "Galería", since: "2019-05-21",
    creditLine: 25000, creditUsed: 8900, paymentTerms: "30 días",
    familyId: "fam-rojas", lastPurchase: "2026-04-28", lastPurchaseAmount: 9200,
    avgMonthly: 9800, ytd: 88200,
    nextFollowup: "2026-05-05", followupReason: "Confirmar despacho lunes",
    priority: "alta", status: "activo",
    brands: ["element", "boosh", "kuntur"], topType: "Polos",
    tags: ["VIP", "Mayorista clave"],
    salesperson: "Diego R.",
  },
  {
    id: "c-005", code: "CL-2019",
    name: "Stand Las Hijas Rojas", contact: "Andrea Rojas", role: "Hija / encargada",
    ruc: "10412785001", phone: "999 102 991",
    region: "lima", district: "La Victoria", address: "Jr. Gamarra 642 · Stand 311",
    tier: "Plata", channel: "Galería", since: "2023-02-12",
    creditLine: 8000, creditUsed: 3200, paymentTerms: "15 días",
    familyId: "fam-rojas", lastPurchase: "2026-04-19", lastPurchaseAmount: 2400,
    avgMonthly: 2900, ytd: 22100,
    nextFollowup: "2026-05-07", followupReason: "Mostrar nueva colección Element Premium",
    priority: "media", status: "activo",
    brands: ["element"], topType: "Cargos",
    tags: [],
    salesperson: "Diego R.",
  },
  {
    id: "c-006", code: "CL-3301",
    name: "Distribuidora Vilca", contact: "Pedro Vilca", role: "Gerente",
    ruc: "20578123455", phone: "959 412 003",
    region: "arequipa", district: "Cercado", address: "Calle Mercaderes 318",
    tier: "Oro", channel: "Mayorista", since: "2018-09-30",
    creditLine: 30000, creditUsed: 11200, paymentTerms: "45 días",
    familyId: "fam-vilca", lastPurchase: "2026-04-25", lastPurchaseAmount: 7800,
    avgMonthly: 8600, ytd: 76400,
    nextFollowup: "2026-05-09", followupReason: "Visita comercial trimestral",
    priority: "media", status: "activo",
    brands: ["qepo", "boosh"], topType: "Jeans",
    tags: ["VIP"],
    salesperson: "Karla M.",
  },
  {
    id: "c-007", code: "CL-3302",
    name: "Vilca Mall Cayma", contact: "Sandra Vilca", role: "Encargada sucursal",
    ruc: "20578123455", phone: "959 412 880",
    region: "arequipa", district: "Cayma", address: "Av. Cayma 720",
    tier: "Plata", channel: "Tienda en mall", since: "2021-06-04",
    creditLine: 10000, creditUsed: 1100, paymentTerms: "Contado",
    familyId: "fam-vilca", lastPurchase: "2026-02-08", lastPurchaseAmount: 1450,
    avgMonthly: 1800, ytd: 9200,
    nextFollowup: "2026-05-05", followupReason: "Sin compras hace 86 días",
    priority: "alta", status: "en-riesgo",
    brands: ["boosh"], topType: "Polos",
    tags: ["Dormido"],
    salesperson: "Karla M.",
  },
  {
    id: "c-008", code: "CL-4012",
    name: "Modas Flores", contact: "Julia Flores Condori", role: "Dueña",
    ruc: "10709812445", phone: "951 778 220",
    region: "puno", district: "Juliaca", address: "Jr. Núñez 1180",
    tier: "Plata", channel: "Tienda mercado", since: "2022-04-15",
    creditLine: 7000, creditUsed: 2800, paymentTerms: "15 días",
    familyId: "fam-flores", lastPurchase: "2026-04-02", lastPurchaseAmount: 2100,
    avgMonthly: 2400, ytd: 19800,
    nextFollowup: "2026-05-06", followupReason: "Cumpleaños del negocio",
    priority: "media", status: "activo",
    brands: ["killari", "qepo"], topType: "Casacas",
    tags: ["Cumpleaños 6 mayo"],
    salesperson: "Karla M.",
  },
  {
    id: "c-009", code: "CL-4013",
    name: "Tienda Don Aurelio", contact: "Aurelio Flores", role: "Esposo · socio",
    ruc: "10709813001", phone: "951 778 401",
    region: "puno", district: "Juliaca", address: "Jr. Núñez 1184",
    tier: "Bronce", channel: "Tienda mercado", since: "2023-09-01",
    creditLine: 4000, creditUsed: 0, paymentTerms: "Contado",
    familyId: "fam-flores", lastPurchase: "2026-01-22", lastPurchaseAmount: 880,
    avgMonthly: 1100, ytd: 4800,
    nextFollowup: "2026-05-08", followupReason: "Reactivación — 103 días sin compra",
    priority: "alta", status: "dormido",
    brands: ["qepo"], topType: "Cargos",
    tags: ["Dormido"],
    salesperson: "Karla M.",
  },
  {
    id: "c-010", code: "CL-5102",
    name: "Multitienda Norte", contact: "Hugo Saavedra", role: "Dueño",
    ruc: "20512784456", phone: "961 220 445",
    region: "trujillo", district: "Trujillo", address: "Jr. Pizarro 540",
    tier: "Oro", channel: "Tienda céntrica", since: "2020-02-18",
    creditLine: 20000, creditUsed: 6400, paymentTerms: "30 días",
    familyId: null, lastPurchase: "2026-04-30", lastPurchaseAmount: 5200,
    avgMonthly: 6100, ytd: 52400,
    nextFollowup: "2026-05-11", followupReason: "Pedido confirmado · entrega",
    priority: "media", status: "activo",
    brands: ["kuntur", "boosh"], topType: "Casacas",
    tags: ["VIP"],
    salesperson: "Diego R.",
  },
  {
    id: "c-011", code: "CL-5210",
    name: "Boutique Piura Centro", contact: "Lucía Mendoza", role: "Dueña",
    ruc: "10708192033", phone: "968 113 220",
    region: "piura", district: "Piura", address: "Jr. Lima 220",
    tier: "Plata", channel: "Boutique", since: "2022-01-10",
    creditLine: 9000, creditUsed: 2200, paymentTerms: "15 días",
    familyId: null, lastPurchase: "2026-04-08", lastPurchaseAmount: 1980,
    avgMonthly: 2200, ytd: 16800,
    nextFollowup: "2026-05-13", followupReason: "Reposición Element Premium",
    priority: "baja", status: "activo",
    brands: ["element"], topType: "Polos",
    tags: [],
    salesperson: "Karla M.",
  },
  {
    id: "c-012", code: "CL-6001",
    name: "Tienda Wari", contact: "Edgar Quispe", role: "Dueño",
    ruc: "10678120098", phone: "966 882 411",
    region: "ayacucho", district: "Huamanga", address: "Jr. 28 de Julio 410",
    tier: "Bronce", channel: "Tienda barrio", since: "2024-03-22",
    creditLine: 3000, creditUsed: 0, paymentTerms: "Contado",
    familyId: null, lastPurchase: "2026-03-30", lastPurchaseAmount: 720,
    avgMonthly: 900, ytd: 3600,
    nextFollowup: "2026-05-14", followupReason: "Primera reposición",
    priority: "baja", status: "activo",
    brands: ["killari"], topType: "Casacas",
    tags: ["Nuevo"],
    salesperson: "Diego R.",
  },
  {
    id: "c-013", code: "CL-6112",
    name: "Mercado Modelo - Stand 88", contact: "Yolanda Cieza", role: "Dueña",
    ruc: "10456120099", phone: "974 220 818",
    region: "chiclayo", district: "Chiclayo", address: "Av. Balta s/n",
    tier: "Plata", channel: "Mercado", since: "2021-11-05",
    creditLine: 6000, creditUsed: 4800, paymentTerms: "15 días",
    familyId: null, lastPurchase: "2026-04-15", lastPurchaseAmount: 1620,
    avgMonthly: 1900, ytd: 13200,
    nextFollowup: "2026-05-06", followupReason: "Crédito al 80% — cobranza",
    priority: "alta", status: "activo",
    brands: ["qepo", "boosh"], topType: "Jeans",
    tags: ["Crédito ajustado"],
    salesperson: "Karla M.",
  },
  {
    id: "c-014", code: "CL-7001",
    name: "Boutique Huancayo Real", contact: "Ana Paredes", role: "Dueña",
    ruc: "20456718890", phone: "964 100 882",
    region: "huancayo", district: "El Tambo", address: "Calle Real 520",
    tier: "Oro", channel: "Boutique", since: "2019-08-14",
    creditLine: 14000, creditUsed: 3600, paymentTerms: "30 días",
    familyId: null, lastPurchase: "2026-04-20", lastPurchaseAmount: 4200,
    avgMonthly: 4600, ytd: 41800,
    nextFollowup: "2026-05-10", followupReason: "Cierre temporada",
    priority: "media", status: "activo",
    brands: ["element", "killari"], topType: "Cargos",
    tags: ["VIP"],
    salesperson: "Diego R.",
  },
  {
    id: "c-015", code: "CL-7220",
    name: "Tacna Express Modas", contact: "Marco Yufra", role: "Dueño",
    ruc: "20689012231", phone: "952 880 110",
    region: "tacna", district: "Tacna", address: "Av. Bolognesi 880",
    tier: "Plata", channel: "Tienda", since: "2022-09-08",
    creditLine: 8000, creditUsed: 1100, paymentTerms: "Contado",
    familyId: null, lastPurchase: "2026-03-12", lastPurchaseAmount: 2200,
    avgMonthly: 2400, ytd: 14800,
    nextFollowup: "2026-05-15", followupReason: "Sin compras hace 54 días",
    priority: "media", status: "en-riesgo",
    brands: ["qepo"], topType: "Cargos",
    tags: [],
    salesperson: "Karla M.",
  },
];

// Historial de interacciones (cliente, fecha, tipo, monto, marca, productos)
const INTERACTIONS = [
  // Boutique Boosh Wasi
  { id:"i-001", clientId:"c-001", date:"2026-04-12", type:"compra", amount:3850, channel:"WhatsApp", brand:"kuntur", items:[{type:"Casacas", qty:24}, {type:"Casacas", qty:18}], note:"Pidió reposición de talles M y L. Pago a 30 días." },
  { id:"i-002", clientId:"c-001", date:"2026-04-10", type:"llamada", channel:"Llamada", note:"Coordinó visita a Cusco para mostrar muestrario otoño." },
  { id:"i-003", clientId:"c-001", date:"2026-03-08", type:"visita", channel:"Visita", note:"Revisamos tienda — recomendé reorganizar exhibición de Killari." },
  { id:"i-004", clientId:"c-001", date:"2026-02-22", type:"compra", amount:4100, channel:"WhatsApp", brand:"killari", items:[{type:"Casacas", qty:32}], note:"Buena rotación de chompas baby alpaca." },
  { id:"i-005", clientId:"c-001", date:"2026-01-15", type:"compra", amount:3200, channel:"Visita", brand:"element", items:[{type:"Polos", qty:28}, {type:"Cargos", qty:6}] },
  { id:"i-006", clientId:"c-001", date:"2025-12-04", type:"compra", amount:5800, channel:"Visita", brand:"kuntur", items:[{type:"Casacas", qty:40}], note:"Pedido especial fiestas de fin de año." },

  // Galería Rojas
  { id:"i-010", clientId:"c-004", date:"2026-04-28", type:"compra", amount:9200, channel:"WhatsApp", brand:"element", items:[{type:"Polos", qty:80}, {type:"Shorts", qty:24}] },
  { id:"i-011", clientId:"c-004", date:"2026-04-19", type:"llamada", channel:"Llamada", note:"Confirmó campaña Día de la Madre." },
  { id:"i-012", clientId:"c-004", date:"2026-03-30", type:"compra", amount:8400, channel:"Visita", brand:"boosh", items:[{type:"Polos", qty:120}] },

  // Distribuidora Vilca
  { id:"i-020", clientId:"c-006", date:"2026-04-25", type:"compra", amount:7800, channel:"Email", brand:"qepo", items:[{type:"Jeans", qty:60}] },
  { id:"i-021", clientId:"c-006", date:"2026-03-18", type:"compra", amount:6200, channel:"WhatsApp", brand:"boosh", items:[{type:"Polos", qty:80}] },

  // Vilca Cayma (en riesgo)
  { id:"i-030", clientId:"c-007", date:"2026-02-08", type:"compra", amount:1450, channel:"Visita", brand:"boosh", items:[{type:"Polos", qty:18}] },
  { id:"i-031", clientId:"c-007", date:"2026-01-12", type:"llamada", channel:"Llamada", note:"Mencionó baja de ventas en mall." },

  // Modas Flores
  { id:"i-040", clientId:"c-008", date:"2026-04-02", type:"compra", amount:2100, channel:"WhatsApp", brand:"killari", items:[{type:"Casacas", qty:24}] },

  // Tienda Don Aurelio (dormido)
  { id:"i-050", clientId:"c-009", date:"2026-01-22", type:"compra", amount:880, channel:"Visita", brand:"qepo", items:[{type:"Cargos", qty:12}] },

  // Multitienda Norte
  { id:"i-060", clientId:"c-010", date:"2026-04-30", type:"compra", amount:5200, channel:"WhatsApp", brand:"kuntur", items:[{type:"Casacas", qty:32}] },
];

// Tareas de seguimiento del día (asignadas al vendedor logueado: Diego R.)
const ME = { name: "Diego Romero", initials: "DR", role: "Vendedor sénior", territory: "Sur + Lima Centro" };

// KPI sintéticos para dashboard
const KPIS = {
  ventasMes:      { value: 142800, prev: 128400, label: "Ventas del mes" },
  clientesActivos:{ value: 87,     prev: 91,    label: "Clientes activos" },
  enRiesgo:       { value: 12,     prev: 8,     label: "En riesgo / dormidos" },
  cobranzaPend:   { value: 38400,  prev: 41200, label: "Por cobrar" },
};

// Automatizaciones definidas
const AUTOMATIONS = [
  { id:"a1", name:"Reactivar dormidos",      trigger:"Sin compras hace 60+ días", action:"Crear tarea de llamada al vendedor",      active:true,  fired:14 },
  { id:"a2", name:"Crédito al límite",       trigger:"Crédito usado ≥ 80%",        action:"Avisar al vendedor + bloquear nuevo pedido", active:true, fired:6 },
  { id:"a3", name:"Cumpleaños del negocio",  trigger:"Día = aniversario tienda",   action:"Plantilla WhatsApp + 5% descuento",       active:true,  fired:23 },
  { id:"a4", name:"Recompra esperada",       trigger:"Día = última compra + frecuencia promedio", action:"Recordatorio en 'Hoy'", active:true, fired:31 },
  { id:"a5", name:"Bienvenida nuevo cliente",trigger:"Cliente creado",             action:"Tarea + plantilla WA + asignar territorio", active:false, fired:0 },
  { id:"a6", name:"Cierre de mes",           trigger:"Día 28",                     action:"Resumen al gerente + clientes pendientes",  active:true, fired:4 },
];

// Seguimientos registrados (separado de las ventas que vienen de Odoo)
const FOLLOWUPS = [
  { id:"f1", clientId:"c-001", date:"2026-05-03", result:"interesado",  emoji:"💬", label:"Interesado · pendiente", note:"Pidió cotización formal de Killari talles M-XL", by:"Diego R." },
  { id:"f2", clientId:"c-001", date:"2026-04-25", result:"compro",      emoji:"🛒", label:"Compró", note:"Pedido cerrado por WhatsApp", by:"Diego R." },
  { id:"f3", clientId:"c-002", date:"2026-05-02", result:"cobranza",    emoji:"💳", label:"Cobranza", note:"Confirmó pago el viernes", by:"Diego R." },
  { id:"f4", clientId:"c-004", date:"2026-05-01", result:"compro",      emoji:"🛒", label:"Compró", note:"Despacho confirmado lunes", by:"Diego R." },
  { id:"f5", clientId:"c-007", date:"2026-04-28", result:"no-contesta", emoji:"📵", label:"No contesta", note:"3er intento esta semana", by:"Karla M." },
  { id:"f6", clientId:"c-009", date:"2026-04-20", result:"no-contesta", emoji:"📵", label:"No contesta", note:"Probar martes en horario de tarde", by:"Karla M." },
];

const SALESPEOPLE = [
  { id:"diego",  name:"Diego R.", initials:"DR", territory:"Sur + Lima", quota:120000, sold: 88400, clients: 9 },
  { id:"karla",  name:"Karla M.", initials:"KM", territory:"Norte + Altiplano", quota:90000, sold: 64200, clients: 6 },
  { id:"andres", name:"Andrés P.", initials:"AP", territory:"Selva", quota:60000, sold: 22100, clients: 0 },
];

const WA_TEMPLATES = [
  { id:"t1", name:"Recordatorio reposición", body:"Hola {contacto}, te saluda {vendedor} de Hilo. Vi que tu última compra fue hace {dias} días, ¿te ayudo con la reposición? 🧶" },
  { id:"t2", name:"Cobranza amable", body:"Hola {contacto}, te recordamos que tienes una cuenta por {monto} con vencimiento próximo. Cualquier coordinación me avisas 🙏" },
  { id:"t3", name:"Cumpleaños del negocio", body:"¡Felicidades por un año más de {nombre}! 🎉 Por la fecha tienes 5% de descuento en tu próximo pedido." },
  { id:"t4", name:"Nueva colección", body:"Hola {contacto}, llegó la nueva colección de {marca}. Te paso fotos para que separes lo que necesites." },
  { id:"t5", name:"Reactivación dormido", body:"Hola {contacto}, ha pasado un tiempo. ¿Cómo va el negocio? Tenemos novedades que te pueden interesar." },
];

// ============================================================
// EXTENSIONES — lógica comercial real
// ============================================================

// Frecuencia esperada de recompra (días) por canal/tier
const FREQ_EXPECTED = {
  "Mayorista":      35,
  "Galería":        28,
  "Boutique":       42,
  "Tienda céntrica":40,
  "Tienda en mall": 45,
  "Tienda de barrio":50,
  "Tienda barrio":  50,
  "Tienda mercado": 35,
  "Mercado":        35,
  "Tienda":         45,
};

// Calcula estado automático del cliente
function calcStatus(c) {
  const today = new Date("2026-05-05");
  const last = new Date(c.lastPurchase);
  const days = Math.floor((today - last) / 86400000);
  const expected = FREQ_EXPECTED[c.channel] || 45;
  const sinceCreated = Math.floor((today - new Date(c.since)) / 86400000);
  const ratio = days / expected;

  if (sinceCreated < 90 && c.ytd > 0) return { state: "nuevo", days, expected, ratio };
  if (days > expected * 4) return { state: "perdido", days, expected, ratio };
  if (days > expected * 2.5) return { state: "dormido", days, expected, ratio };
  if (days > expected * 1.4) return { state: "en-riesgo", days, expected, ratio };
  if (c.tier === "Oro" && c.ytd > 50000) return { state: "vip", days, expected, ratio };
  if (c.tags && c.tags.includes("Recuperado")) return { state: "recuperado", days, expected, ratio };
  return { state: "activo", days, expected, ratio };
}

// Motor de oportunidades — analiza cada cliente vs el catálogo
function calcOpportunities(c) {
  const ops = [];
  const otherBrands = BRANDS.filter(b => !c.brands.includes(b.id));
  // Cross-sell de marca
  if (otherBrands.length > 0 && c.tier !== "Bronce") {
    const target = otherBrands[0];
    ops.push({
      type: "cross-marca",
      title: `No compra ${target.name}`,
      detail: `Compra ${c.brands.length} marca${c.brands.length>1?"s":""}, no ha probado ${target.name}`,
      estimate: Math.round(c.avgMonthly * 0.35),
      action: `Mostrar muestrario ${target.name}`,
      priority: c.tier === "Oro" ? "alta" : "media",
    });
  }
  // Cross-sell de tipo de producto
  const allTypes = [...new Set(BRANDS.flatMap(b => b.types))];
  const myTypes = BRANDS.filter(b => c.brands.includes(b.id)).flatMap(b => b.types);
  const missingTypes = allTypes.filter(t => !myTypes.includes(t)).slice(0, 1);
  if (missingTypes.length && c.ytd > 10000) {
    ops.push({
      type: "cross-tipo",
      title: `No vende ${missingTypes[0]}`,
      detail: `Cliente fuerte pero no incorpora ${missingTypes[0]} a su mix`,
      estimate: Math.round(c.avgMonthly * 0.25),
      action: `Enviar look-book ${missingTypes[0]}`,
      priority: "media",
    });
  }
  // Bajó ticket
  if (c.id === "c-007" || c.id === "c-015") {
    ops.push({
      type: "bajo-ticket",
      title: "Ticket bajó 35%",
      detail: "Promedio últimos 3 meses bajo respecto a histórico",
      estimate: Math.round(c.avgMonthly * 0.4),
      action: "Llamada para entender por qué",
      priority: "alta",
    });
  }
  // Dejó de comprar tipo
  if (c.id === "c-001") {
    ops.push({
      type: "dejo-tipo",
      title: "Dejó de comprar Hoodies",
      detail: "Compraba Hoodies Kuntur cada 2 meses, no lo pide hace 90 días",
      estimate: 1200,
      action: "Ofrecer Hoodies nueva temporada",
      priority: "media",
    });
  }
  return ops;
}

// Motivos de no-compra
const NO_PURCHASE_REASONS = [
  { id:"precio",       label:"Precio alto",            emoji:"💰" },
  { id:"liquidez",     label:"No tiene liquidez",      emoji:"💸" },
  { id:"competencia",  label:"Compró a otro proveedor", emoji:"⚔️" },
  { id:"temporada",    label:"Espera nueva colección",  emoji:"📅" },
  { id:"modelos",      label:"No le gustaron los modelos", emoji:"👗" },
  { id:"calidad",      label:"Problema con calidad",   emoji:"⚠️" },
  { id:"despacho",     label:"Problema con despacho",  emoji:"📦" },
  { id:"credito",      label:"Quiere crédito",         emoji:"💳" },
  { id:"sin-respuesta",label:"No responde",            emoji:"📵" },
  { id:"cerro",        label:"Cerró el negocio",       emoji:"🚪" },
  { id:"despues",      label:"Compra más adelante",    emoji:"🕐" },
  { id:"otro",         label:"Otro motivo",            emoji:"❓" },
];

// ─────────────────────────────────────────────────────────────
// PIPELINE COMERCIAL — etapas, campañas, asignaciones
// ─────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { id:"no-contactado",    label:"No contactado",        color:"#8A7B5C", bg:"rgba(138,123,92,.10)",  short:"Sin tocar" },
  { id:"contactado",       label:"Contactado",           color:"#3F5566", bg:"rgba(63,85,102,.10)",   short:"Contactado" },
  { id:"interesado",       label:"Interesado",           color:"#5C7A5A", bg:"rgba(92,122,90,.10)",   short:"Interesado" },
  { id:"catalogo-enviado", label:"Catálogo enviado",     color:"#1F8A5B", bg:"rgba(31,138,91,.10)",   short:"Catálogo" },
  { id:"pedido-conv",      label:"Pedido en conversación", color:"#C98A3B", bg:"rgba(201,138,59,.12)", short:"Armando pedido" },
  { id:"pago-pendiente",   label:"Pago pendiente",       color:"#B5462A", bg:"rgba(181,70,42,.10)",   short:"Esperando pago" },
  { id:"compro",           label:"Compró",               color:"#3F5A3D", bg:"rgba(63,90,61,.14)",    short:"Compró" },
  { id:"reprogramar",      label:"Reprogramar",          color:"#7A4E7E", bg:"rgba(122,78,126,.10)",  short:"Reprogramado" },
  { id:"no-responde",      label:"No responde",          color:"#9A8E72", bg:"rgba(154,142,114,.10)", short:"Sin respuesta" },
  { id:"no-interesado",    label:"No interesado",        color:"#5C5C5C", bg:"rgba(92,92,92,.10)",    short:"Descartado" },
];

const CAMPAIGN_TYPES = [
  { id:"recuperacion",    label:"Recuperación",         color:"#7A4E7E" },
  { id:"recompra",        label:"Recompra",             color:"#5C7A5A" },
  { id:"nuevos",          label:"Clientes nuevos",      color:"#2A6FDB" },
  { id:"provincia",       label:"Provincia específica", color:"#3F5566" },
  { id:"coleccion",       label:"Nueva colección",      color:"#C98A3B" },
  { id:"mayorista",       label:"Campaña mayorista",    color:"#B5462A" },
  { id:"dormidos",        label:"Clientes dormidos",    color:"#8A7B5C" },
];

// Campañas comerciales asignadas (listas de trabajo)
const SALES_CAMPAIGNS = [
  {
    id:"sc-01", name:"Dormidos Arequipa · mayo",
    type:"dormidos", status:"activa",
    seller:"diego", startDate:"2026-04-28", deadline:"2026-05-15",
    objective:"Recuperar clientes sin compra hace +60 días",
    targetBrand:"qepo", targetType:"Jeans", targetRegion:"arequipa",
    clientIds:["c-006","c-009","c-013"],
  },
  {
    id:"sc-02", name:"Recompra Cusco · QEPO baggy",
    type:"recompra", status:"activa",
    seller:"diego", startDate:"2026-05-01", deadline:"2026-05-20",
    objective:"Reposición de jeans baggy nueva temporada",
    targetBrand:"qepo", targetType:"Jeans", targetRegion:"cusco",
    clientIds:["c-001","c-002","c-003","c-010","c-012"],
  },
  {
    id:"sc-03", name:"Nueva colección Killari · norte",
    type:"coleccion", status:"activa",
    seller:"karla", startDate:"2026-05-02", deadline:"2026-05-25",
    objective:"Presentar colección otoño Killari",
    targetBrand:"killari", targetType:"Casacas", targetRegion:"trujillo",
    clientIds:["c-007","c-008","c-011","c-014","c-015"],
  },
  {
    id:"sc-04", name:"Galerías Lima · campaña madres",
    type:"mayorista", status:"finalizada",
    seller:"diego", startDate:"2026-04-10", deadline:"2026-04-30",
    objective:"Reposición previa Día de la Madre",
    targetBrand:"element", targetType:"Polos", targetRegion:"lima",
    clientIds:["c-004","c-005"],
  },
];

// Estado pipeline por cliente dentro de cada campaña
// (clientId, campaignId) → stage actual
const PIPELINE_ENTRIES = [
  // sc-01 Dormidos Arequipa
  { campaignId:"sc-01", clientId:"c-006", stage:"contactado",      priority:"alta",  lastResult:"Llamé · pidió tiempo",      nextAction:"Volver a llamar viernes",          nextDate:"2026-05-09", touches:2 },
  { campaignId:"sc-01", clientId:"c-009", stage:"interesado",      priority:"alta",  lastResult:"Pidió catálogo de jeans",   nextAction:"Enviar catálogo + lista de precios", nextDate:"2026-05-06", touches:3 },
  { campaignId:"sc-01", clientId:"c-013", stage:"no-contactado",   priority:"media", lastResult:"",                          nextAction:"Llamar primera vez",                nextDate:"2026-05-06", touches:0 },

  // sc-02 Recompra Cusco
  { campaignId:"sc-02", clientId:"c-001", stage:"compro",          priority:"alta",  lastResult:"Pedido S/ 3,850 cerrado",   nextAction:"Confirmar despacho lunes",          nextDate:"2026-05-12", touches:5 },
  { campaignId:"sc-02", clientId:"c-002", stage:"pago-pendiente",  priority:"alta",  lastResult:"Pedido armado · espera pago", nextAction:"Confirmar pago Yape",             nextDate:"2026-05-06", touches:4 },
  { campaignId:"sc-02", clientId:"c-003", stage:"pedido-conv",     priority:"media", lastResult:"Está armando pedido",       nextAction:"Cerrar lista de SKUs",              nextDate:"2026-05-07", touches:3 },
  { campaignId:"sc-02", clientId:"c-010", stage:"catalogo-enviado",priority:"media", lastResult:"Catálogo enviado por WA",   nextAction:"Llamar para confirmar interés",     nextDate:"2026-05-06", touches:2 },
  { campaignId:"sc-02", clientId:"c-012", stage:"no-responde",     priority:"baja",  lastResult:"3 mensajes sin respuesta",  nextAction:"Reintentar en 7 días",              nextDate:"2026-05-13", touches:3 },

  // sc-03 Killari norte
  { campaignId:"sc-03", clientId:"c-007", stage:"reprogramar",     priority:"media", lastResult:"Pidió que la llame en 15 días", nextAction:"Reagendar mediados de mayo",    nextDate:"2026-05-15", touches:1 },
  { campaignId:"sc-03", clientId:"c-008", stage:"no-contactado",   priority:"alta",  lastResult:"",                          nextAction:"Primer contacto",                   nextDate:"2026-05-06", touches:0 },
  { campaignId:"sc-03", clientId:"c-011", stage:"interesado",      priority:"media", lastResult:"Le interesa colección otoño", nextAction:"Enviar catálogo Killari",         nextDate:"2026-05-07", touches:2 },
  { campaignId:"sc-03", clientId:"c-014", stage:"contactado",      priority:"baja",  lastResult:"Llamada breve, pidió WA",    nextAction:"Enviar WhatsApp con presentación", nextDate:"2026-05-06", touches:1 },
  { campaignId:"sc-03", clientId:"c-015", stage:"no-interesado",   priority:"baja",  lastResult:"Ya tiene proveedor",        nextAction:"Reintentar en 60 días",             nextDate:"2026-07-05", touches:1, reason:"competencia" },

  // sc-04 Galerías Lima (finalizada)
  { campaignId:"sc-04", clientId:"c-004", stage:"compro",          priority:"alta",  lastResult:"Pedido S/ 9,200 entregado", nextAction:"Seguimiento postventa",             nextDate:"2026-05-10", touches:6 },
  { campaignId:"sc-04", clientId:"c-005", stage:"compro",          priority:"media", lastResult:"Pedido S/ 2,400 entregado", nextAction:"Mostrar nueva colección Element Premium",    nextDate:"2026-05-07", touches:4 },
];

// Acciones rápidas dentro del pipeline (alimentan el motor)
const QUICK_ACTIONS = [
  { id:"llame",            label:"Llamé",              emoji:"📞", to:"contactado" },
  { id:"wa",               label:"Envié WhatsApp",     emoji:"💬", to:"contactado" },
  { id:"catalogo",         label:"Envié catálogo",     emoji:"📋", to:"catalogo-enviado" },
  { id:"interesado",       label:"Pidió precios",      emoji:"💡", to:"interesado" },
  { id:"armando",          label:"Está armando pedido", emoji:"🛍️", to:"pedido-conv" },
  { id:"pago",             label:"Espera pago",        emoji:"💳", to:"pago-pendiente" },
  { id:"compro",           label:"Compró",             emoji:"🛒", to:"compro" },
  { id:"no-responde",      label:"No respondió",       emoji:"📵", to:"no-responde" },
  { id:"no-interesado",    label:"No interesado",      emoji:"🚫", to:"no-interesado" },
  { id:"reprogramar",      label:"Reprogramar",        emoji:"🕐", to:"reprogramar" },
];

// Oportunidades pre-calculadas para todos los clientes (cache)
const OPPORTUNITIES = CLIENTS.flatMap(c => calcOpportunities(c).map((o, i) => ({
  id: `${c.id}-op-${i}`,
  clientId: c.id,
  clientName: c.name,
  region: c.region,
  ...o,
})));

// Detalle de productos por cliente (entalle, modelo, talla, color) — sample para análisis
const PRODUCT_DETAIL = [
  { brand:"kuntur", type:"Casacas",  model:"Apu Andino",     fit:"Regular",  size:"M", color:"Terracota", units: 240 },
  { brand:"kuntur", type:"Casacas",  model:"Apu Andino",     fit:"Regular",  size:"L", color:"Terracota", units: 312 },
  { brand:"kuntur", type:"Casacas",  model:"Apu Andino",     fit:"Slim",     size:"M", color:"Negro",     units: 180 },
  { brand:"kuntur", type:"Casacas",  model:"Inti",           fit:"Oversize", size:"M", color:"Crudo",     units: 142 },
  { brand:"kuntur", type:"Polos",    model:"Wari",           fit:"Regular",  size:"L", color:"Olivo",     units: 220 },
  { brand:"element", type:"Polos",   model:"Killa",          fit:"Regular",  size:"M", color:"Terracota", units: 380 },
  { brand:"element", type:"Polos",   model:"Killa",          fit:"Regular",  size:"S", color:"Crema",     units: 290 },
  { brand:"element", type:"Cargos", model:"Sara",           fit:"Slim",     size:"M", color:"Negro",     units: 168 },
  { brand:"element", type:"Shorts",   model:"Quri",           fit:"Regular",  size:"M", color:"Mostaza",   units: 124 },
  { brand:"qepo",  type:"Jeans",    model:"Río Vilcanota",  fit:"Skinny",   size:"30",color:"Indigo",    units: 412 },
  { brand:"qepo",  type:"Jeans",    model:"Río Vilcanota",  fit:"Straight", size:"32",color:"Indigo",    units: 388 },
  { brand:"qepo",  type:"Jeans",    model:"Río Vilcanota",  fit:"Slim",     size:"32",color:"Negro",     units: 256 },
  { brand:"qepo",  type:"Cargos",model:"Pampa",         fit:"Regular",  size:"34",color:"Caqui",     units: 198 },
  { brand:"killari",type:"Casacas",  model:"Baby Alpaca",    fit:"Regular",  size:"M", color:"Crudo",     units: 320 },
  { brand:"killari",type:"Casacas",  model:"Baby Alpaca",    fit:"Regular",  size:"L", color:"Plomo",     units: 280 },
  { brand:"killari",type:"Casacas",model:"Q'eros",         fit:"Oversize", size:"U", color:"Vino",      units: 156 },
  { brand:"killari",type:"Drill",  model:"Apu Wamani",     fit:"Único",    size:"U", color:"Multicolor",units: 88 },
  { brand:"boosh",  type:"Polos",  model:"Lima",           fit:"Regular",  size:"M", color:"Blanco",    units: 410 },
  { brand:"boosh",  type:"Polos",  model:"Lima",           fit:"Slim",     size:"M", color:"Celeste",   units: 280 },
  { brand:"boosh",  type:"Polos",    model:"Costa",          fit:"Regular",  size:"L", color:"Azul",      units: 340 },
  { brand:"boosh",  type:"Shorts", model:"Pacífico",       fit:"Regular",  size:"32",color:"Beige",     units: 188 },
];

// Campañas WhatsApp con métricas
const CAMPAIGNS = [
  {
    id:"camp-1", name:"Reactivación dormidos sur", date:"2026-04-22",
    template:"t5", segment:"Dormidos región Sur",
    contacted: 84, responded: 31, purchased: 12, revenue: 18400,
    status:"completada"
  },
  {
    id:"camp-2", name:"Día de la Madre Element Premium", date:"2026-04-28",
    template:"t4", segment:"Clientes oro y plata · Element Premium",
    contacted: 142, responded: 78, purchased: 41, revenue: 62800,
    status:"completada"
  },
  {
    id:"camp-3", name:"Cobranza mes vencido", date:"2026-04-30",
    template:"t2", segment:"Crédito usado >70% y vence",
    contacted: 38, responded: 22, purchased: 0, revenue: 0,
    paid: 28400, status:"completada"
  },
  {
    id:"camp-4", name:"Nueva colección Killari otoño", date:"2026-05-04",
    template:"t4", segment:"Compradores históricos Killari",
    contacted: 97, responded: 41, purchased: 14, revenue: 21600,
    status:"en-curso"
  },
  {
    id:"camp-5", name:"Cumpleaños mayo", date:"2026-05-01",
    template:"t3", segment:"Aniversario negocio en mayo",
    contacted: 18, responded: 11, purchased: 6, revenue: 8200,
    status:"completada"
  },
];

// Timeline unificado tipos
const TIMELINE_TYPES = {
  compra:    { emoji:"🛒", label:"Compra",    color:"#5C7A5A" },
  llamada:   { emoji:"📞", label:"Llamada",   color:"#3F5566" },
  whatsapp:  { emoji:"💬", label:"WhatsApp",  color:"#1F8A5B" },
  visita:    { emoji:"📍", label:"Visita",    color:"#7A4E7E" },
  reclamo:   { emoji:"⚠️", label:"Reclamo",   color:"#B5462A" },
  pago:      { emoji:"💳", label:"Pago",      color:"#C98A3B" },
  despacho:  { emoji:"📦", label:"Despacho",  color:"#3F5566" },
  nota:      { emoji:"📝", label:"Nota",      color:"#8A7B5C" },
};

// Eventos timeline unificado adicionales (despachos, reclamos, pagos)
const TIMELINE_EVENTS = [
  { id:"e1", clientId:"c-001", date:"2026-04-15", type:"despacho", title:"Despacho enviado", detail:"Olva Courier · 3 cajas · Cusco", by:"Sistema" },
  { id:"e2", clientId:"c-001", date:"2026-04-18", type:"pago", title:"Pago recibido", detail:"S/ 3,850 · Yape", by:"Odoo" },
  { id:"e3", clientId:"c-004", date:"2026-04-12", type:"reclamo", title:"Reclamo · talles M faltantes", detail:"Faltaron 4 piezas en pedido. Resuelto con reposición.", by:"Diego R." },
  { id:"e4", clientId:"c-007", date:"2026-03-02", type:"reclamo", title:"Camisa con falla de costura", detail:"Cambio gestionado, devolvió 2 pzs.", by:"Karla M." },
  { id:"e5", clientId:"c-008", date:"2026-04-05", type:"despacho", title:"Despacho enviado", detail:"Shalom · Juliaca", by:"Sistema" },
];

// ─────────────────────────────────────────────────────────────
// CALENDARIO COMERCIAL — fechas clave del año mayorista PE
// ─────────────────────────────────────────────────────────────
const COMMERCIAL_CALENDAR = [
  { id:"madre",     date:"2026-05-10", name:"Día de la Madre",     prepStart:"2026-04-15", category:"fecha", impact:"alta",  brands:["element","boosh","kuntur"], note:"Pico de blusas, polos y casacas livianas" },
  { id:"padre",     date:"2026-06-21", name:"Día del Padre",       prepStart:"2026-05-25", category:"fecha", impact:"alta",  brands:["qepo","element"], note:"Camisas y jeans premium" },
  { id:"invierno",  date:"2026-06-21", name:"Inicio invierno",     prepStart:"2026-05-15", category:"temporada", impact:"alta", brands:["killari","kuntur","element"], note:"Casacas, drill, cargos abrigos" },
  { id:"fpatrias",  date:"2026-07-28", name:"Fiestas Patrias",     prepStart:"2026-07-01", category:"fecha", impact:"alta",  brands:["element","qepo","boosh","kuntur"], note:"Pico anual de venta · todas las marcas" },
  { id:"sta-rosa",  date:"2026-08-30", name:"Santa Rosa de Lima",  prepStart:"2026-08-15", category:"fecha", impact:"media", brands:["element"], note:"Provincia Lima, tiendas chicas" },
  { id:"primavera", date:"2026-09-23", name:"Inicio primavera",    prepStart:"2026-09-01", category:"temporada", impact:"media", brands:["boosh","element"], note:"Polos, shorts, ropa liviana" },
  { id:"halloween", date:"2026-10-31", name:"Halloween",           prepStart:"2026-10-10", category:"fecha", impact:"baja",  brands:["boosh"], note:"Repunte menor, polos estampados" },
  { id:"bf",        date:"2026-11-27", name:"Black Friday",        prepStart:"2026-11-10", category:"campaña", impact:"alta",  brands:["element","qepo","boosh"], note:"Liquidación, descuentos por volumen" },
  { id:"navidad",   date:"2026-12-25", name:"Navidad",             prepStart:"2026-11-15", category:"fecha", impact:"alta",  brands:["element","qepo","boosh","kuntur","killari"], note:"Pico final de año · canasta familiar" },
  { id:"verano",    date:"2026-12-22", name:"Inicio verano",       prepStart:"2026-11-30", category:"temporada", impact:"alta", brands:["boosh","element"], note:"Shorts, polos · vendedores costa" },
  { id:"escolar",   date:"2026-03-01", name:"Campaña escolar",     prepStart:"2026-01-15", category:"campaña", impact:"media", brands:["qepo","kuntur"], note:"Polos institucionales, drill" },
];

// ─────────────────────────────────────────────────────────────
// STOCK / CATÁLOGO — productos con foto, talla, color, stock
// ─────────────────────────────────────────────────────────────
const PRODUCT_COLORS = [
  { id:"negro",   label:"Negro",   hex:"#1F1A14" },
  { id:"blanco",  label:"Blanco",  hex:"#F0EDE5" },
  { id:"azul",    label:"Azul",    hex:"#2C4A6B" },
  { id:"rojo",    label:"Rojo",    hex:"#A8351F" },
  { id:"verde",   label:"Verde",   hex:"#3F5A3D" },
  { id:"gris",    label:"Gris",    hex:"#6E6660" },
  { id:"beige",   label:"Beige",   hex:"#C9B68C" },
  { id:"mostaza", label:"Mostaza", hex:"#C98A3B" },
];
const PRODUCT_SIZES_TOP    = ["S","M","L","XL","XXL"];
const PRODUCT_SIZES_BOTTOM = ["28","30","32","34","36","38"];

// SVG product placeholder generator — silueta editorial, colorable
function pImg(type, hex) {
  const t = type.toLowerCase();
  let path = "";
  if (t.includes("polo") || t.includes("camis")) {
    path = "M60 50 L40 70 L50 95 L75 80 L75 200 L165 200 L165 80 L190 95 L200 70 L180 50 L150 40 L140 55 Q120 65 100 55 L90 40 Z";
  } else if (t.includes("casaca") || t.includes("hood")) {
    path = "M55 50 L40 80 L50 120 L75 100 L75 210 L120 210 L120 130 L120 210 L165 210 L165 100 L190 120 L200 80 L185 50 L155 45 L145 75 Q120 90 95 75 L85 45 Z";
  } else if (t.includes("short")) {
    path = "M70 60 L70 170 L100 175 L120 110 L140 175 L170 170 L170 60 Z";
  } else if (t.includes("jean") || t.includes("cargo") || t.includes("drill") || t.includes("pantal")) {
    path = "M70 50 L70 220 L105 220 L115 130 L125 130 L135 220 L170 220 L170 50 Z";
  } else {
    path = "M60 60 L60 200 L180 200 L180 60 Z";
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><rect width='240' height='240' fill='#f4f1ec'/><path d='${path}' fill='${hex}' stroke='#000' stroke-opacity='0.10' stroke-width='1.2'/></svg>`)}`;
}

const PRODUCTS = [
  // Element Premium
  { id:"p-001", brand:"element", type:"Jeans",   name:"Slim Premium 502",  sku:"EP-J502",  price:89,  cost:48, stock:142, lowStock:30, isNew:false, isBestseller:true,  colors:["negro","azul","gris"],          sizes:PRODUCT_SIZES_BOTTOM, season:"Invierno 2026", img: pImg("jean", "#223955") },
  { id:"p-002", brand:"element", type:"Jeans",   name:"Skinny Stretch",    sku:"EP-J404",  price:79,  cost:42, stock:8,   lowStock:30, isNew:false, isBestseller:false, colors:["negro","azul"],                  sizes:PRODUCT_SIZES_BOTTOM, season:"Invierno 2026", img: pImg("jean", "#131722") },
  { id:"p-003", brand:"element", type:"Polos",   name:"Polo Básico Pima",  sku:"EP-P101",  price:32,  cost:14, stock:340, lowStock:50, isNew:false, isBestseller:true,  colors:["blanco","negro","gris","azul","beige"], sizes:PRODUCT_SIZES_TOP, season:"Continuo", img: pImg("polo", "#F0EDE5") },
  { id:"p-004", brand:"element", type:"Cargos",  name:"Cargo Utility",     sku:"EP-C220",  price:75,  cost:38, stock:54,  lowStock:25, isNew:true,  isBestseller:false, colors:["beige","verde","negro"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Otoño 2026", img: pImg("cargo", "#C9B68C") },
  { id:"p-005", brand:"element", type:"Casacas", name:"Bomber Premium",    sku:"EP-B330",  price:155, cost:78, stock:0,   lowStock:15, isNew:false, isBestseller:false, colors:["negro","verde"],                 sizes:PRODUCT_SIZES_TOP, season:"Invierno 2026", img: pImg("casaca", "#1F1A14") },
  // QEPO
  { id:"p-006", brand:"qepo",    type:"Jeans",   name:"Wide Leg QEPO",     sku:"QP-W110",  price:95,  cost:52, stock:62,  lowStock:25, isNew:true,  isBestseller:false, colors:["azul","negro","beige"],          sizes:PRODUCT_SIZES_BOTTOM, season:"Primavera 2026", img: pImg("jean", "#2C4A6B") },
  { id:"p-007", brand:"qepo",    type:"Drill",   name:"Pantalón Drill Slim",sku:"QP-D200", price:68,  cost:35, stock:88,  lowStock:30, isNew:false, isBestseller:true,  colors:["beige","negro","verde"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Continuo", img: pImg("drill", "#C9B68C") },
  { id:"p-008", brand:"qepo",    type:"Cargos",  name:"Cargo Wide",        sku:"QP-C310",  price:82,  cost:42, stock:18,  lowStock:25, isNew:false, isBestseller:false, colors:["negro","verde","beige"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Otoño 2026", img: pImg("cargo", "#3F5A3D") },
  { id:"p-009", brand:"qepo",    type:"Shorts",  name:"Short Cargo",       sku:"QP-S120",  price:55,  cost:28, stock:120, lowStock:40, isNew:true,  isBestseller:false, colors:["beige","negro","verde"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Verano 2026", img: pImg("short", "#C9B68C") },
  // Boosh
  { id:"p-010", brand:"boosh",   type:"Polos",   name:"Polo Oversize",     sku:"BO-P210",  price:38,  cost:18, stock:245, lowStock:50, isNew:true,  isBestseller:true,  colors:["blanco","negro","mostaza","verde"], sizes:PRODUCT_SIZES_TOP, season:"Verano 2026", img: pImg("polo", "#C98A3B") },
  { id:"p-011", brand:"boosh",   type:"Casacas", name:"Casaca Sherpa",     sku:"BO-C400",  price:135, cost:68, stock:42,  lowStock:20, isNew:false, isBestseller:false, colors:["beige","negro"],                 sizes:PRODUCT_SIZES_TOP, season:"Invierno 2026", img: pImg("casaca", "#C9B68C") },
  { id:"p-012", brand:"boosh",   type:"Shorts",  name:"Short Beach",       sku:"BO-S130",  price:48,  cost:22, stock:180, lowStock:40, isNew:false, isBestseller:false, colors:["azul","blanco","mostaza"],       sizes:PRODUCT_SIZES_BOTTOM, season:"Verano 2026", img: pImg("short", "#2C4A6B") },
  // Kuntur
  { id:"p-013", brand:"kuntur",  type:"Polos",   name:"Polo Institucional",sku:"KU-P150",  price:28,  cost:13, stock:520, lowStock:80, isNew:false, isBestseller:true,  colors:["blanco","negro","azul","rojo"],  sizes:PRODUCT_SIZES_TOP, season:"Continuo", img: pImg("polo", "#F0EDE5") },
  { id:"p-014", brand:"kuntur",  type:"Casacas", name:"Casaca Polar",      sku:"KU-C500",  price:115, cost:58, stock:24,  lowStock:20, isNew:false, isBestseller:false, colors:["negro","gris","azul"],           sizes:PRODUCT_SIZES_TOP, season:"Invierno 2026", img: pImg("casaca", "#131722") },
  { id:"p-015", brand:"kuntur",  type:"Drill",   name:"Drill Clásico",     sku:"KU-D210",  price:62,  cost:32, stock:96,  lowStock:30, isNew:false, isBestseller:false, colors:["beige","negro","verde"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Continuo", img: pImg("drill", "#6E6660") },
  // Killari
  { id:"p-016", brand:"killari", type:"Casacas", name:"Casaca Trucker",    sku:"KI-C610",  price:145, cost:72, stock:36,  lowStock:20, isNew:true,  isBestseller:false, colors:["azul","negro","beige"],          sizes:PRODUCT_SIZES_TOP, season:"Otoño 2026", img: pImg("casaca", "#2C4A6B") },
  { id:"p-017", brand:"killari", type:"Cargos",  name:"Cargo Heavy",       sku:"KI-C320",  price:88,  cost:45, stock:52,  lowStock:25, isNew:false, isBestseller:true,  colors:["verde","negro","beige"],         sizes:PRODUCT_SIZES_BOTTOM, season:"Otoño 2026", img: pImg("cargo", "#3F5A3D") },
  { id:"p-018", brand:"killari", type:"Drill",   name:"Drill Workwear",    sku:"KI-D330",  price:78,  cost:40, stock:14,  lowStock:25, isNew:false, isBestseller:false, colors:["beige","negro"],                 sizes:PRODUCT_SIZES_BOTTOM, season:"Continuo", img: pImg("drill", "#1F1A14") },
];

window.HiloLogic = {
  FREQ_EXPECTED, calcStatus, calcOpportunities,
  NO_PURCHASE_REASONS, OPPORTUNITIES, PRODUCT_DETAIL,
  CAMPAIGNS, TIMELINE_TYPES, TIMELINE_EVENTS,
  PIPELINE_STAGES, CAMPAIGN_TYPES, SALES_CAMPAIGNS, PIPELINE_ENTRIES, QUICK_ACTIONS,
  COMMERCIAL_CALENDAR,
  PRODUCTS, PRODUCT_COLORS, PRODUCT_SIZES_TOP, PRODUCT_SIZES_BOTTOM,
};

// ============================================================
// VENTAS DETALLADAS — 2 años (2025 + YTD 2026) por cliente con productos
// Generado para alimentar la pestaña "Ventas" con comparativo YoY
// ============================================================
const SALES_LINES = (() => {
  // Pool de productos vendibles (SKU + price + brand + type + entalle + acabado)
  const POOL = [
    { sku:"EP-J502", brand:"element", type:"Pantalon Denim", model:"Slim Premium 502", fit:"Skinny",   finish:"Denim",   price:89  },
    { sku:"EP-J404", brand:"element", type:"Pantalon Denim", model:"Skinny Stretch",   fit:"Semi Extra", finish:"Denim",   price:79 },
    { sku:"EP-J608", brand:"element", type:"Pantalon Denim", model:"Skinny Jogg",      fit:"Skinny",   finish:"Jogg",    price:85  },
    { sku:"EP-J707", brand:"element", type:"Pantalon Denim", model:"Skinny Satinado",  fit:"Skinny",   finish:"Satinado",price:92  },
    { sku:"EP-D200", brand:"element", type:"Pantalon Drill", model:"Drill Slim",       fit:"Slim",     finish:"Drill",   price:75  },
    { sku:"EP-D210", brand:"element", type:"Pantalon Drill", model:"Jogger Cargo",     fit:"Jogger",   finish:"Drill",   price:82  },
    { sku:"EP-C330", brand:"element", type:"Casaca",         model:"Bomber Premium",   fit:"Slim",     finish:"Comfort", price:155 },
    { sku:"EP-C340", brand:"element", type:"Casaca",         model:"Polar Trucker",    fit:"Regular",  finish:"Comfort", price:165 },
    { sku:"EP-P101", brand:"element", type:"Polo",           model:"Polo Pima",        fit:"Regular",  finish:"Pique",   price:32  },
    { sku:"QP-W110", brand:"qepo",    type:"Pantalon Denim", model:"Wide Leg",         fit:"Wide",     finish:"Denim",   price:95  },
    { sku:"QP-D200", brand:"qepo",    type:"Pantalon Drill", model:"Slim Drill",       fit:"Slim",     finish:"Drill",   price:68  },
    { sku:"BO-P210", brand:"boosh",   type:"Polo",           model:"Polo Oversize",    fit:"Oversize", finish:"Pique",   price:38  },
    { sku:"KU-P150", brand:"kuntur",  type:"Polo",           model:"Polo Institucional",fit:"Regular", finish:"Pique",   price:28  },
    { sku:"KU-C500", brand:"kuntur",  type:"Casaca",         model:"Polar Andino",     fit:"Regular",  finish:"Polar",   price:115 },
    { sku:"KI-C610", brand:"killari", type:"Casaca",         model:"Trucker",          fit:"Regular",  finish:"Comfort", price:145 },
    { sku:"KI-C320", brand:"killari", type:"Cargo",          model:"Heavy Cargo",      fit:"Regular",  finish:"Drill",   price:88  },
  ];
  // Pseudo-RNG determinista (mulberry32)
  const seeded = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const lines = [];
  let ordIdx = 1;
  const today = new Date("2026-05-07"); // 7 may 2026 = "hoy" para YTD
  // Por cada cliente generar entre 6 y 22 órdenes a lo largo de 2 años
  CLIENTS.forEach((c, ci) => {
    const rnd = seeded(c.id.split("-")[1].charCodeAt(0) * 100 + ci);
    const baseOrders = 6 + Math.floor(rnd() * 16);
    for (let o = 0; o < baseOrders; o++) {
      // Distribución: 60% en 2025 (full year), 40% en 2026 hasta hoy
      const inPast = rnd() < 0.6;
      let date;
      if (inPast) {
        const m = Math.floor(rnd() * 12);    // ene-dic 2025
        const d = 1 + Math.floor(rnd() * 28);
        date = new Date(2025, m, d);
      } else {
        const monthsBack = Math.floor(rnd() * 4); // 0..3 meses atrás de hoy (ene..may 2026)
        const d = 1 + Math.floor(rnd() * 28);
        const targetMonth = today.getMonth() - monthsBack;
        date = new Date(2026, targetMonth, d);
        if (date > today) date = new Date(today);
      }
      // 1-3 SKUs por orden, preferentemente de las marcas del cliente
      const numSkus = 1 + Math.floor(rnd() * 3);
      const orderId = "ord-" + String(ordIdx++).padStart(5, "0");
      for (let s = 0; s < numSkus; s++) {
        // Elegir SKU: 70% de marcas del cliente, 30% otras
        const preferOwn = rnd() < 0.7;
        const candidates = preferOwn
          ? POOL.filter(p => c.brands.includes(p.brand))
          : POOL;
        const pool = candidates.length ? candidates : POOL;
        const p = pool[Math.floor(rnd() * pool.length)];
        const qty = 6 + Math.floor(rnd() * 60);
        lines.push({
          orderId,
          clientId: c.id,
          date: date.toISOString().slice(0, 10),
          sku: p.sku, brand: p.brand, type: p.type, model: p.model, fit: p.fit, finish: p.finish,
          qty,
          price: p.price,
          total: p.price * qty,
        });
      }
    }
  });
  return lines;
})();

window.HiloData = { BRANDS, REGIONS, FAMILIES, CLIENTS, INTERACTIONS, ME, KPIS, AUTOMATIONS, FOLLOWUPS, SALESPEOPLE, WA_TEMPLATES, COUNTRIES, DEPARTMENTS, SALES_LINES };