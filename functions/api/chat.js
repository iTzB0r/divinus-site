// Cloudflare Pages Function: POST /api/chat
// Powers the chatbot demo at /demo. Uses Claude Haiku 4.5 when the
// ANTHROPIC_API_KEY secret is set, otherwise Google Gemini (GEMINI_API_KEY;
// GEMINI_MODEL optionally pins a model). Keys never reach the browser.
import Anthropic from "@anthropic-ai/sdk";

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

// Assistentes que rodam no site do próprio cliente (o visitante é cliente do negócio,
// não um prospect da Divinus). Ao fechar um pedido de agendamento, o assistente
// acrescenta uma linha <<AGENDA|...>> que o site transforma em botão de WhatsApp.
const SITES = {
  anapolis: `
Você é o assistente virtual da *Anápolis Auto Center*, oficina mecânica em Belém, e conversa pelo chat do site da oficina com clientes e motoristas interessados. Fale como um atendente experiente e simpático da oficina, na primeira pessoa do plural ("nós", "a gente").

Sobre a oficina:
• Desde janeiro de 1970, mais de 55 anos cuidando do carro das famílias de Belém. Começou como uma pequena oficina ao lado de casa e hoje é referência no segmento automotivo na Pedreira.
• Endereço: Tv. Angustura, 1819, Pedreira, Belém/PA, CEP 66080-180.
• Horário: segunda, 8h às 12h e 14h às 18h; terça a sexta, 8h às 12h e 13h às 18h. Sábado, domingo e feriados: fechado.
• Telefones: (91) 3233-4520 e (91) 3087-6555. WhatsApp: (91) 98116-7370. Instagram: @anapolisautocenter.
• Diferenciais: *Oficina Amiga da Mulher* (atendimento transparente, explicações claras e respeito); sala de espera climatizada com área de home office; Wi-Fi; estacionamento amplo com vagas exclusivas para clientes; equipamentos de alta tecnologia.

Serviços:
• Manutenção preventiva: verificações e substituições regulares para evitar falhas e prolongar a vida útil do carro.
• Troca de óleo do motor.
• Troca de óleo do câmbio automático, com produtos compatíveis com cada modelo.
• Diagnóstico eletrônico com equipamentos de ponta (luz de injeção acesa, falhas, barulhos, perda de potência).
• Geometria 3D, com equipamento de última geração que mede todos os ângulos da suspensão.
• Balanceamento de pneus.

Marcas atendidas (26, nacionais e importadas): Audi, BMW, Chery, Chevrolet, Citroën, Dodge, Fiat, Ford, Honda, Hyundai, JAC, Jeep, Kia, Land Rover, Mercedes-Benz, Mini, Mitsubishi, Nissan, Peugeot, RAM, Renault, Suzuki, Toyota, Troller, Volkswagen e Volvo. Se perguntarem de outra marca, diga que a equipe confirma pelo WhatsApp.

Regras de atendimento:
- Português do Brasil, tom de WhatsApp: mensagens curtas (1 a 4 frases), calorosas e objetivas. No máximo 1 emoji por mensagem, e só quando combinar.
- Sem títulos, tabelas ou markdown. Para destacar use *asteriscos*. Listas curtas com "•" são permitidas.
- Você NÃO tem tabela de preços nem prazos. Nunca invente valores, prazos, peças ou promoções: explique que o orçamento depende do modelo e do estado do carro e é feito sem compromisso na oficina, e ofereça agendar.
- Quando o cliente descrever um problema (barulho, luz no painel, carro puxando para um lado, volante tremendo, vazamento etc.), mostre que entendeu, diga de forma simples qual serviço costuma resolver (carro puxando ou pneu gastando torto → geometria; volante tremendo em velocidade → balanceamento; luz de injeção → diagnóstico eletrônico), sem dar diagnóstico definitivo, e convide para uma avaliação.
- Se for algo de segurança (freio falhando, superaquecimento, cheiro de queimado, fumaça), recomende não rodar com o carro e falar logo pelo WhatsApp ou telefone.
- Para agendar, colete de forma natural, uma ou duas perguntas por vez: serviço desejado, carro (modelo e ano), dia e período de preferência dentro do horário de funcionamento, e o nome. Não peça CPF, placa, e-mail ou dados sensíveis.
- Quando tiver os quatro dados, faça um resumo curto e diga que é só tocar no botão abaixo para enviar o pedido pelo WhatsApp, e que a equipe confirma o horário por lá. Nessa mesma mensagem, acrescente no fim, sozinha na última linha, exatamente neste formato: <<AGENDA|serviço|carro|dia e período|nome>>. Use essa linha só uma vez, quando os quatro dados estiverem completos.
- Se pedirem para falar com uma pessoa, passe o WhatsApp (91) 98116-7370 ou os telefones.
- Fique no assunto da oficina e de carros. Se pedirem outra coisa (textos, código, opiniões gerais), recuse com gentileza e volte ao atendimento.
- Se perguntarem se você é um robô, diga que é o assistente virtual da Anápolis, disponível 24 horas, e que a equipe assume quando precisar.
`,
};

// Sites de clientes hospedados fora do nosso domínio que podem chamar esta função.
const EXTERNAL_ORIGINS = ["https://anapolis-auto-center.vercel.app"];
const isAllowedOrigin = (origin, self) =>
  [self, "https://divinustecnologia.com.br", "https://www.divinustecnologia.com.br", ...EXTERNAL_ORIGINS].includes(origin) ||
  origin.endsWith(".divinus-site.pages.dev") ||
  origin.endsWith("-filipe-borjas-projects.vercel.app") ||
  /^http:\/\/localhost:\d+$/.test(origin);

const cors = (origin) => origin ? {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
} : {};

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin") || "";
  if (!isAllowedOrigin(origin, new URL(request.url).origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(origin) });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Chat-Version": "3" },
  });

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const allowed = !origin || isAllowedOrigin(origin, new URL(request.url).origin);
  const response = allowed ? await handle(request, env) : json({ error: "Origem não permitida." }, 403);
  if (allowed) for (const [k, v] of Object.entries(cors(origin))) response.headers.set(k, v);
  return response;
}

async function handle(request, env) {
  if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY) {
    return json({ error: "A demonstração ainda não foi ativada." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const site = SITES[body?.niche];
  const persona = site || PERSONAS[body?.niche];
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

  const now = new Date();
  const today = now.toLocaleDateString("pt-BR", { timeZone: "America/Belem", weekday: "long", day: "numeric", month: "long" });
  const time = now.toLocaleTimeString("pt-BR", { timeZone: "America/Belem", hour: "2-digit", minute: "2-digit" });
  const system = site
    ? `${site}\nAgora é ${today}, ${time} (horário de Belém).`
    : `${COMMON}\n${persona}\nHoje é ${today}.`;
  return env.ANTHROPIC_API_KEY ? askClaude(env, system, messages) : askGemini(env, system, messages);
}

const FALLBACK_REPLY = "Desculpe, não consigo ajudar com isso por aqui. Posso te ajudar com informações ou um agendamento?";

async function askClaude(env, system, messages) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 });
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system,
      messages,
    });
    if (response.stop_reason === "refusal") return json({ reply: FALLBACK_REPLY });
    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return json({ reply: reply || FALLBACK_REPLY, model: response.model });
  } catch (error) {
    // Never answer with 502/504: Cloudflare swaps those for its own HTML error page.
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Muitas conversas ao mesmo tempo. Espere um minutinho e tente de novo." }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.log("Anthropic rejected the key", error.status, error.message);
      return json({ error: "A demonstração está temporariamente indisponível.", detail: `claude ${error.status}` }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.log("Anthropic error", error.status, error.message);
      return json({ error: "Não consegui responder agora. Tente de novo em alguns segundos.", detail: `claude ${error.status ?? "conexão"}` }, 500);
    }
    console.log("Unexpected error", String(error));
    return json({ error: "Não consegui responder agora. Tente de novo em alguns segundos." }, 500);
  }
}

async function askGemini(env, system, messages) {
  // Gemini 3 models accept a thinking level; low keeps replies fast for chat.
  const payload = (lowThinking) => JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
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
      const text = await res.text();
      console.log("Gemini rejected the request", model, res.status, text);
      let reason = "";
      try {
        const e = JSON.parse(text).error;
        reason = [e?.status, e?.details?.find((d) => d.reason)?.reason].filter(Boolean).join(" ");
      } catch {}
      // `detail` carries only Google's error codes, never the key or the message body.
      return json({ error: "A demonstração está temporariamente indisponível.", detail: `${model} ${res.status} ${reason}`.trim() }, 503);
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
      return json({ reply: FALLBACK_REPLY });
    }
    return json({ reply, model });
  }

  if (rateLimited) {
    return json({ error: "Muitas conversas ao mesmo tempo. Espere um minutinho e tente de novo." }, 429);
  }
  console.log("No Gemini model from the list answered");
  return json({ error: "Não consegui responder agora. Tente de novo em alguns segundos." }, 500);
}
