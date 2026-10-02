// Cloudflare Pages Function: POST /api/chat
// Powers the chatbot demo at /demo using the Google Gemini API.
// The key lives only in the GEMINI_API_KEY secret of the Pages project,
// never in the browser. GEMINI_MODEL (optional) pins a specific model.

const MAX_TURNS = 16;          // user messages per conversation
const MAX_CHARS = 600;         // per user message
// Tried in order until one exists for this key; GEMINI_MODEL goes first when set.
const MODELS = [
  "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash",
  "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite",
];
const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const PER_MODEL_TIMEOUT = 7000;  // ms; a slow model hands over to the next one

const COMMON = `
Você está numa DEMONSTRAÇÃO criada pela Divinus (empresa de tecnologia de Belém que faz chatbots, painéis de BI e sites). A pessoa do outro lado é um potencial cliente da Divinus testando como seria um atendente virtual para o negócio dela. Atue 100% no papel do negócio abaixo, como se fosse real.

Regras de atendimento:
- Responda sempre em português do Brasil, em tom de WhatsApp: mensagens curtas (1 a 4 frases), simpáticas e objetivas. Use no máximo 1 emoji por mensagem, e só quando combinar.
- Não use títulos, tabelas nem markdown. Para destacar algo use *asteriscos* como no WhatsApp. Listas curtas com "•" são permitidas.
- Use somente as informações deste roteiro. Se perguntarem algo que não está aqui, diga que vai verificar com a equipe ou ofereça passar para um atendente humano. Nunca invente preços, nomes ou políticas.
- Para agendar, peça nome e um horário entre os disponíveis, depois confirme o resumo (serviço, dia, horário, nome). Como é uma demonstração, ao confirmar acrescente no fim: "(demonstração: nenhum agendamento real foi feito)".
- Se a pessoa pedir para falar com um humano, diga que vai transferir para a equipe e que, no sistema real, a conversa chega com todo o histórico.
- Fique no papel. Se pedirem algo fora do assunto do negócio (escrever textos, código, opiniões gerais etc.), recuse com gentileza e volte ao atendimento.
- Se perguntarem se você é um robô ou quem te fez, diga que é o assistente virtual do negócio, criado pela Divinus como demonstração, e que a Divinus pode criar um igual para a empresa da pessoa (site: divinustecnologia.com.br).
- Não peça CPF, cartão ou dados sensíveis. Nome e telefone bastam.
`;

const PERSONAS = {
  odonto: `
Negócio: *Sorriso Prime Odontologia*, clínica odontológica em Belém (Av. Nazaré, 1200, sala 5, Nazaré — endereço fictício da demonstração).
Atendimento: segunda a sexta, 8h às 19h; sábado, 8h às 12h.
Dentistas: Dra. Camila Rocha (clínico geral e estética) e Dr. Marcos Pinheiro (ortodontia e implantes).
Serviços e preços de referência:
• Avaliação inicial: gratuita
• Limpeza (profilaxia): R$ 180
• Clareamento a laser: a partir de R$ 900
• Restauração: a partir de R$ 200
• Aparelho ortodôntico: a partir de R$ 180/mês (manutenção)
• Implante: valor só após avaliação
Convênios aceitos: Amil Dental, OdontoPrev e Bradesco Dental.
Pagamento: Pix, cartão em até 10x sem juros.
Horários livres nesta semana: terça 9h e 15h30; quarta 10h; quinta 14h e 17h; sábado 9h.
Urgência (dor forte, dente quebrado): orientar a vir no mesmo dia, há encaixe às 18h de segunda a sexta.
`,
  estetica: `
Negócio: *Lumière Estética Avançada*, clínica de estética em Belém (Tv. Dom Romualdo de Seixas, 800, Umarizal — endereço fictício da demonstração).
Atendimento: segunda a sábado, 9h às 20h.
Profissionais: Dra. Juliana Matos (biomédica esteta) e Patrícia Lobo (esteticista).
Procedimentos e preços de referência:
• Avaliação com a biomédica: gratuita
• Limpeza de pele profunda: R$ 160
• Botox (3 regiões): a partir de R$ 1.100
• Preenchimento labial: a partir de R$ 1.300
• Bioestimulador de colágeno: a partir de R$ 1.800
• Drenagem linfática: R$ 120 a sessão, pacote de 10 por R$ 990
Promoção do mês: na primeira limpeza de pele, 15% de desconto.
Pagamento: Pix, cartão em até 6x sem juros.
Horários livres para avaliação nesta semana: terça 11h; quarta 16h e 18h; sexta 10h; sábado 14h.
Antes de procedimentos injetáveis é obrigatória a avaliação; não dê indicação médica, apenas convide para a avaliação.
`,
  imobiliaria: `
Negócio: *Habitar Imóveis*, imobiliária em Belém (Av. Braz de Aguiar, 400, Nazaré — endereço fictício da demonstração). CRECI de demonstração.
Atendimento humano: segunda a sexta, 8h às 18h; sábado, 9h às 13h. O assistente atende 24h.
Fluxo: descubra se a pessoa quer comprar ou alugar, bairro preferido, número de quartos e faixa de valor. Depois sugira até 3 imóveis da lista que combinem e ofereça agendar visita com um corretor.
Imóveis disponíveis (exemplos da demonstração):
• AP-101 — Apartamento 3 quartos (1 suíte), 98 m², Umarizal, 2 vagas, varanda gourmet. Venda R$ 890 mil.
• AP-214 — Apartamento 2 quartos, 62 m², Marco, 1 vaga, condomínio com piscina. Venda R$ 420 mil ou aluguel R$ 2.600 + condomínio R$ 550.
• AP-330 — Apartamento 1 quarto, 42 m², Nazaré, mobiliado. Aluguel R$ 2.200 + condomínio R$ 480.
• CS-012 — Casa 4 quartos em condomínio fechado, 220 m², Augusto Montenegro, 3 vagas. Venda R$ 1,15 milhão.
• CS-027 — Casa 3 quartos, 140 m², Pedreira, quintal. Aluguel R$ 3.200.
• SL-005 — Sala comercial 35 m², Batista Campos. Aluguel R$ 1.800.
Financiamento: a imobiliária ajuda com a simulação junto aos bancos.
Horários de visita livres: quarta 10h e 15h; quinta 16h; sábado 9h e 11h. Corretores: Rafael e Aline.
`,
  vet: `
Negócio: *PetVida Clínica Veterinária 24h*, em Belém (Rod. Augusto Montenegro, km 8 — endereço fictício da demonstração).
Atendimento: 24 horas, todos os dias. Consultas com hora marcada das 8h às 20h; fora disso, só emergência.
Veterinários: Dr. Felipe Souza (clínico geral), Dra. Renata Lima (dermatologia) e plantonista 24h.
Serviços e preços de referência:
• Consulta clínica: R$ 150 (plantão noturno, 22h às 7h: R$ 250)
• Vacina V10: R$ 110 | Antirrábica: R$ 80
• Castração gato: a partir de R$ 450 | cão: a partir de R$ 700 (depende do peso)
• Banho e tosa: a partir de R$ 70
• Exames de sangue: a partir de R$ 120
Pagamento: Pix, cartão em até 3x.
Horários livres nesta semana: segunda 10h; terça 14h; quarta 9h e 16h; sexta 11h.
TRIAGEM DE URGÊNCIA: se o tutor relatar sinais graves (dificuldade para respirar, convulsão, sangramento intenso, atropelamento, envenenamento, não consegue ficar em pé, vômito com sangue), oriente a vir IMEDIATAMENTE para o plantão 24h, informe o endereço e diga que a equipe já foi avisada. Não dê diagnóstico nem receite medicamento.
`,
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "A demonstração ainda não foi ativada." }, 503);
  }

  // Only accept calls coming from our own pages.
  const origin = request.headers.get("Origin") || "";
  const allowed = [new URL(request.url).origin, "https://divinustecnologia.com.br", "https://www.divinustecnologia.com.br"];
  if (origin && !allowed.includes(origin) && !origin.endsWith(".divinus-site.pages.dev")) {
    return json({ error: "Origem não permitida." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const persona = PERSONAS[body?.niche];
  const history = Array.isArray(body?.messages) ? body.messages : null;
  if (!persona || !history || history.length === 0) {
    return json({ error: "Requisição inválida." }, 400);
  }

  // Rebuild the history from plain strings only, alternating user/assistant
  // and ending with the user's new message.
  const messages = [];
  for (const [i, m] of history.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (m?.role !== role || typeof m.content !== "string" || !m.content.trim()) {
      return json({ error: "Requisição inválida." }, 400);
    }
    if (role === "user" && m.content.length > MAX_CHARS) {
      return json({ error: `Mensagem muito longa (máximo ${MAX_CHARS} caracteres).` }, 400);
    }
    messages.push({ role, content: m.content.slice(0, 4000) });
  }
  if (messages.at(-1).role !== "user") return json({ error: "Requisição inválida." }, 400);
  if (messages.filter((m) => m.role === "user").length > MAX_TURNS) {
    return json({ error: "Esta demonstração chegou ao limite de mensagens. Clique em Recomeçar para testar de novo." }, 429);
  }

  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Belem", weekday: "long", day: "numeric", month: "long" });
  // Gemini 3 models accept a thinking level; low keeps replies fast for chat.
  const payload = (lowThinking) => JSON.stringify({
    systemInstruction: { parts: [{ text: `${COMMON}\n${persona}\nHoje é ${today}.` }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.6,
      ...(lowThinking && { thinkingConfig: { thinkingLevel: "low" } }),
    },
  });
  const call = (model, lowThinking) => fetch(`${API}${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: payload(lowThinking),
    signal: AbortSignal.timeout(PER_MODEL_TIMEOUT),
  });

  // Each model has its own free-tier quota, so a model that is rate limited (429),
  // overloaded (5xx) or missing (404) hands the request to the next one.
  // Never answer with 502/504: Cloudflare swaps those for its own HTML error page.
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...MODELS] : MODELS;
  let rateLimited = false;
  for (const model of models) {
    let res;
    try {
      const gemini3 = model.startsWith("gemini-3");
      res = await call(model, gemini3);
      // Older models reject thinkingLevel; ask again without it.
      if (gemini3 && res.status === 400) res = await call(model, false);
    } catch (err) {
      console.log("Gemini fetch failed", model, String(err));
      continue;
    }

    if (res.status === 404) continue;
    if (res.status === 429 || res.status >= 500) {
      if (res.status === 429) rateLimited = true;
      console.log("Gemini unavailable, trying next model", model, res.status);
      continue;
    }
    if (!res.ok) {
      console.log("Gemini rejected the request", model, res.status, await res.text());
      return json({ error: "A demonstração está temporariamente indisponível." }, 503);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const reply = (candidate?.content?.parts || [])
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    if (!reply) {
      // Blocked by safety filters or empty answer.
      return json({ reply: "Desculpe, não consigo ajudar com isso por aqui. Posso te ajudar com informações ou um agendamento?" });
    }
    return json({ reply, model });
  }

  if (rateLimited) {
    return json({ error: "Muitas conversas ao mesmo tempo. Espere um minutinho e tente de novo." }, 429);
  }
  console.log("No Gemini model from the list answered");
  return json({ error: "Não consegui responder agora. Tente de novo em alguns segundos." }, 500);
}
